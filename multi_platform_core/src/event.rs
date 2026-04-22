#[cfg(feature = "napi")]
use anyhow::{anyhow, Result};
#[cfg(feature = "napi")]
use napi::{
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
    Status,
};
#[cfg(feature = "napi")]
use serde::Serialize;
#[cfg(feature = "napi")]
use std::sync::Mutex;

#[cfg(feature = "napi")]
pub(crate) type EventSink = ThreadsafeFunction<String, ErrorStrategy::Fatal>;

#[cfg(feature = "napi")]
pub(crate) fn emit_serialized_event<T>(
    sink_store: &Mutex<Option<EventSink>>,
    event: &T,
    scope: &str,
) where
    T: Serialize,
{
    let sink = sink_store.lock().ok().and_then(|value| value.clone());
    if let Some(sink) = sink {
        if let Ok(payload) = serde_json::to_string(event) {
            let status = sink.call(payload, ThreadsafeFunctionCallMode::NonBlocking);
            if status != Status::Ok && status != Status::Closing {
                eprintln!("[{scope}] failed to emit event: {status:?}");
            }
        }
    }
}

#[cfg(feature = "napi")]
pub(crate) fn register_event_sink(
    sink_store: &Mutex<Option<EventSink>>,
    sink: EventSink,
    label: &str,
) -> Result<()> {
    let mut store = sink_store
        .lock()
        .map_err(|_| anyhow!("{label} event sink poisoned"))?;
    *store = Some(sink);
    Ok(())
}
