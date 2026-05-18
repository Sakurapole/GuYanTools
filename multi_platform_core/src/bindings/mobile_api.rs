use crate::models::{
    HomeLayout, MultiDeviceClipboardDevice, MultiDeviceClipboardDeviceStatus,
    MultiDeviceClipboardDiscoveredDevice, MultiDeviceClipboardDiscoveryConfig,
    MultiDeviceClipboardItem, SaveMobileHomeCategoryLayoutInput,
    UpsertMultiDeviceClipboardDeviceInput, UpsertMultiDeviceClipboardItemInput,
};

pub fn get_mobile_home_layout(
    db_path: String,
    workspace_key: String,
    layout_scope: String,
) -> anyhow::Result<HomeLayout> {
    super::flutter::get_mobile_home_layout(db_path, workspace_key, layout_scope)
}

pub fn save_mobile_category_layout(
    db_path: String,
    workspace_key: String,
    layout_scope: String,
    input: SaveMobileHomeCategoryLayoutInput,
) -> anyhow::Result<crate::models::HomeLayoutCategory> {
    super::flutter::save_mobile_category_layout(db_path, workspace_key, layout_scope, input)
}

pub fn reset_mobile_category_layout(
    db_path: String,
    workspace_key: String,
    layout_scope: String,
    category_id: String,
) -> anyhow::Result<crate::models::HomeLayoutCategory> {
    super::flutter::reset_mobile_category_layout(db_path, workspace_key, layout_scope, category_id)
}

pub fn create_mobile_clipboard_host(db_path: String) -> anyhow::Result<String> {
    super::flutter::create_mobile_clipboard_host(db_path)
}

pub fn dispose_mobile_clipboard_host(host_id: String) -> anyhow::Result<()> {
    super::flutter::dispose_mobile_clipboard_host(host_id)
}

pub fn get_or_create_mobile_clipboard_local_device(
    host_id: String,
    name: String,
) -> anyhow::Result<MultiDeviceClipboardDevice> {
    super::flutter::get_or_create_mobile_clipboard_local_device(host_id, name)
}

pub fn start_mobile_clipboard_discovery(
    host_id: String,
    config: MultiDeviceClipboardDiscoveryConfig,
) -> anyhow::Result<()> {
    super::flutter::start_mobile_clipboard_discovery(host_id, config)
}

pub fn stop_mobile_clipboard_discovery(host_id: String) -> anyhow::Result<()> {
    super::flutter::stop_mobile_clipboard_discovery(host_id)
}

pub fn list_mobile_clipboard_discovered_devices(
    host_id: String,
) -> anyhow::Result<Vec<MultiDeviceClipboardDiscoveredDevice>> {
    super::flutter::list_mobile_clipboard_discovered_devices(host_id)
}

pub fn list_mobile_clipboard_devices(
    host_id: String,
) -> anyhow::Result<Vec<MultiDeviceClipboardDevice>> {
    super::flutter::list_mobile_clipboard_devices(host_id)
}

pub fn list_mobile_clipboard_device_statuses(
    host_id: String,
    online_window_seconds: i64,
) -> anyhow::Result<Vec<MultiDeviceClipboardDeviceStatus>> {
    super::flutter::list_mobile_clipboard_device_statuses(host_id, online_window_seconds)
}

pub fn upsert_mobile_clipboard_device(
    host_id: String,
    input: UpsertMultiDeviceClipboardDeviceInput,
) -> anyhow::Result<MultiDeviceClipboardDevice> {
    super::flutter::upsert_mobile_clipboard_device(host_id, input)
}

pub fn set_mobile_clipboard_device_trusted(
    host_id: String,
    id: String,
    trusted: bool,
) -> anyhow::Result<MultiDeviceClipboardDevice> {
    super::flutter::set_mobile_clipboard_device_trusted(host_id, id, trusted)
}

pub fn forget_mobile_clipboard_device(host_id: String, id: String) -> anyhow::Result<()> {
    super::flutter::forget_mobile_clipboard_device(host_id, id)
}

pub fn list_mobile_clipboard_items(
    host_id: String,
    limit: i64,
) -> anyhow::Result<Vec<MultiDeviceClipboardItem>> {
    super::flutter::list_mobile_clipboard_items(host_id, limit)
}

pub fn get_mobile_clipboard_item(
    host_id: String,
    id: String,
) -> anyhow::Result<MultiDeviceClipboardItem> {
    super::flutter::get_mobile_clipboard_item(host_id, id)
}

pub fn upsert_mobile_clipboard_item(
    host_id: String,
    input: UpsertMultiDeviceClipboardItemInput,
) -> anyhow::Result<MultiDeviceClipboardItem> {
    super::flutter::upsert_mobile_clipboard_item(host_id, input)
}

pub fn delete_mobile_clipboard_item(host_id: String, id: String) -> anyhow::Result<()> {
    super::flutter::delete_mobile_clipboard_item(host_id, id)
}

pub fn clear_mobile_clipboard_history(host_id: String) -> anyhow::Result<()> {
    super::flutter::clear_mobile_clipboard_history(host_id)
}

pub fn prune_mobile_clipboard_history(host_id: String, history_limit: i64) -> anyhow::Result<()> {
    super::flutter::prune_mobile_clipboard_history(host_id, history_limit)
}

pub fn compute_mobile_clipboard_content_hash(parts: Vec<String>) -> String {
    super::flutter::compute_mobile_clipboard_content_hash(parts)
}

pub fn classify_mobile_clipboard_text(text: String) -> Vec<String> {
    super::flutter::classify_mobile_clipboard_text(text)
}

pub fn clamp_mobile_clipboard_sync_bytes(value: i64) -> i64 {
    super::flutter::clamp_mobile_clipboard_sync_bytes(value)
}
