//! Windows input bridge boundary. The hook implementation is intentionally
//! isolated here so the Electron side can keep a typed, testable contract.

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadSafeCallContext, ThreadsafeFunction};
use napi::JsFunction;
use napi_derive::napi;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};

static EVENT_SINK: OnceLock<
    Mutex<Option<ThreadsafeFunction<String, ErrorStrategy::CalleeHandled>>>,
> = OnceLock::new();
static BLOCKED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
#[cfg(target_os = "windows")]
static LAST_CURSOR: OnceLock<Mutex<(i32, i32)>> = OnceLock::new();
#[cfg(target_os = "windows")]
static HOOK_RUNNING: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NormalizedInputEvent {
    pub kind: &'static str,
    pub dx: i32,
    pub dy: i32,
    pub button: Option<u8>,
    pub down: Option<bool>,
}

pub fn normalize_move(dx: i32, dy: i32) -> NormalizedInputEvent {
    NormalizedInputEvent {
        kind: "move",
        dx: dx.clamp(-127, 127),
        dy: dy.clamp(-127, 127),
        button: None,
        down: None,
    }
}

pub fn normalize_button(button: u8, down: bool) -> NormalizedInputEvent {
    NormalizedInputEvent {
        kind: "button",
        dx: 0,
        dy: 0,
        button: Some(button),
        down: Some(down),
    }
}

#[napi(js_name = "windowsInputStart")]
pub fn windows_input_start(_options: String, _callback: JsFunction) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        let sink = _callback
            .create_threadsafe_function(64, |ctx: ThreadSafeCallContext<String>| {
                Ok(vec![ctx.value])
            })?;
        EVENT_SINK
            .get_or_init(|| Mutex::new(None))
            .lock()
            .map_err(|_| Error::from_reason("ANDROID_INPUT_BRIDGE_UNAVAILABLE"))?
            .replace(sink);
        if !HOOK_RUNNING.swap(true, Ordering::SeqCst) {
            std::thread::spawn(|| unsafe { hook_thread() });
        }
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(Error::from_reason("ANDROID_PLATFORM_UNSUPPORTED"))
    }
}

#[napi(js_name = "windowsInputStop")]
pub fn windows_input_stop() -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        HOOK_RUNNING.store(false, Ordering::SeqCst);
        let thread_id = HOOK_THREAD_ID.load(Ordering::Relaxed);
        if thread_id != 0 {
            use windows_sys::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_QUIT};
            unsafe {
                PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
            }
        }
        BLOCKED.store(false, Ordering::Relaxed);
        use windows_sys::Win32::UI::WindowsAndMessaging::ShowCursor;
        unsafe {
            ShowCursor(1);
        }
    }
    if let Some(sink) = EVENT_SINK.get() {
        if let Ok(mut value) = sink.lock() {
            *value = None;
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
unsafe fn hook_thread() {
    use windows_sys::Win32::Foundation::HINSTANCE;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetMessageW, SetWindowsHookExW, MSG, WH_KEYBOARD_LL, WH_MOUSE_LL,
    };
    HOOK_THREAD_ID.store(
        windows_sys::Win32::System::Threading::GetCurrentThreadId(),
        Ordering::Relaxed,
    );
    let mouse = SetWindowsHookExW(WH_MOUSE_LL, Some(input_mouse_hook), HINSTANCE::default(), 0);
    let keyboard = SetWindowsHookExW(
        WH_KEYBOARD_LL,
        Some(input_keyboard_hook),
        HINSTANCE::default(),
        0,
    );
    if mouse.is_null() || keyboard.is_null() {
        HOOK_RUNNING.store(false, Ordering::SeqCst);
        return;
    }
    let mut message = MSG::default();
    while HOOK_RUNNING.load(Ordering::Relaxed)
        && GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0
    {}
    windows_sys::Win32::UI::WindowsAndMessaging::UnhookWindowsHookEx(mouse);
    windows_sys::Win32::UI::WindowsAndMessaging::UnhookWindowsHookEx(keyboard);
    HOOK_THREAD_ID.store(0, Ordering::Relaxed);
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn input_mouse_hook(code: i32, wparam: usize, lparam: isize) -> isize {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, HC_ACTION, MSLLHOOKSTRUCT, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN,
        WM_MBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_RBUTTONDOWN, WM_RBUTTONUP,
    };
    if code == HC_ACTION as i32 && !lparam.eq(&0) {
        let data = *(lparam as *const MSLLHOOKSTRUCT);
        let event = match wparam as u32 {
            WM_MOUSEMOVE => {
                let cursor = LAST_CURSOR.get_or_init(|| Mutex::new((data.pt.x, data.pt.y)));
                let mut previous = cursor
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let dx = data.pt.x - previous.0;
                let dy = data.pt.y - previous.1;
                *previous = (data.pt.x, data.pt.y);
                serde_json::json!({"kind":"move","x":data.pt.x,"y":data.pt.y,"dx":dx,"dy":dy})
            }
            WM_LBUTTONDOWN | WM_LBUTTONUP => {
                serde_json::json!({"kind":"button","button":0,"down":wparam as u32 == WM_LBUTTONDOWN})
            }
            WM_RBUTTONDOWN | WM_RBUTTONUP => {
                serde_json::json!({"kind":"button","button":1,"down":wparam as u32 == WM_RBUTTONDOWN})
            }
            WM_MBUTTONDOWN | WM_MBUTTONUP => {
                serde_json::json!({"kind":"button","button":2,"down":wparam as u32 == WM_MBUTTONDOWN})
            }
            WM_MOUSEWHEEL => {
                serde_json::json!({"kind":"wheel","delta":((data.mouseData >> 16) as i16)})
            }
            _ => serde_json::Value::Null,
        };
        if !event.is_null() {
            let guaranteed = !matches!(wparam as u32, WM_MOUSEMOVE | WM_MOUSEWHEEL);
            emit_event(event.to_string(), guaranteed);
        }
    }
    if BLOCKED.load(Ordering::Relaxed) {
        return 1;
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn input_keyboard_hook(code: i32, wparam: usize, lparam: isize) -> isize {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_UP, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN,
        WM_SYSKEYUP,
    };
    if code == HC_ACTION as i32 && !lparam.eq(&0) {
        let data = *(lparam as *const KBDLLHOOKSTRUCT);
        let down =
            matches!(wparam as u32, WM_KEYDOWN | WM_SYSKEYDOWN) && data.flags & LLKHF_UP == 0;
        if matches!(
            wparam as u32,
            WM_KEYDOWN | WM_KEYUP | WM_SYSKEYDOWN | WM_SYSKEYUP
        ) {
            emit_event(
                serde_json::json!({"kind":"key","code":data.vkCode,"down":down,"modifiers":0})
                    .to_string(),
                true,
            );
        }
    }
    if BLOCKED.load(Ordering::Relaxed) {
        return 1;
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

#[cfg(target_os = "windows")]
fn emit_event(value: String, guaranteed: bool) {
    if let Some(sink) = EVENT_SINK
        .get()
        .and_then(|value| value.lock().ok().and_then(|guard| guard.clone()))
    {
        let mode = if guaranteed {
            napi::threadsafe_function::ThreadsafeFunctionCallMode::Blocking
        } else {
            napi::threadsafe_function::ThreadsafeFunctionCallMode::NonBlocking
        };
        let _ = sink.call(Ok(value), mode);
    }
}

#[napi(js_name = "windowsInputGetCursor")]
pub fn windows_input_get_cursor() -> Result<Vec<i32>> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut point = POINT { x: 0, y: 0 };
        if unsafe { GetCursorPos(&mut point) } == 0 {
            return Err(Error::from_reason("ANDROID_INPUT_CURSOR_UNAVAILABLE"));
        }
        return Ok(vec![point.x, point.y]);
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(Error::from_reason("ANDROID_PLATFORM_UNSUPPORTED"))
    }
}

#[napi(js_name = "windowsInputSetCursor")]
pub fn windows_input_set_cursor(_x: i32, _y: i32) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::SetCursorPos;
        if unsafe { SetCursorPos(_x, _y) } == 0 {
            return Err(Error::from_reason("ANDROID_INPUT_CURSOR_UNAVAILABLE"));
        }
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(Error::from_reason("ANDROID_PLATFORM_UNSUPPORTED"))
    }
}

#[napi(js_name = "windowsInputSetBlocked")]
pub fn windows_input_set_blocked(_blocked: bool) -> Result<()> {
    BLOCKED.store(_blocked, std::sync::atomic::Ordering::Relaxed);
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::BlockInput;
        unsafe {
            BlockInput(if _blocked { 1 } else { 0 });
            windows_sys::Win32::UI::WindowsAndMessaging::ShowCursor(if _blocked { 0 } else { 1 });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{normalize_button, normalize_move};

    #[test]
    fn movement_is_bounded_without_dropping_button_semantics() {
        assert_eq!(normalize_move(500, -500).dx, 127);
        assert_eq!(normalize_move(500, -500).dy, -127);
        assert_eq!(normalize_button(2, false).down, Some(false));
    }

    #[test]
    fn coordinate_bounds_are_i32() {
        assert_eq!(i32::MIN, -2_147_483_648);
        assert_eq!(i32::MAX, 2_147_483_647);
    }
}
