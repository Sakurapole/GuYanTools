use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiConversation {
    pub id: String,
    pub title: String,
    pub provider_id: String,
    pub model_id: String,
    pub system_prompt: Option<String>,
    pub pinned: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateAiConversationInput {
    pub id: String,
    pub title: String,
    pub provider_id: String,
    pub model_id: String,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateAiConversationInput {
    pub title: Option<String>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
    pub pinned: Option<bool>,
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub parent_message_id: Option<String>,
    pub model_id: Option<String>,
    pub provider_id: Option<String>,
    pub token_usage_json: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateAiMessageInput {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub parent_message_id: Option<String>,
    pub model_id: Option<String>,
    pub provider_id: Option<String>,
    pub token_usage_json: Option<String>,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateAiMessageInput {
    pub content: Option<String>,
    pub status: Option<String>,
    pub token_usage_json: Option<String>,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiCitation {
    pub id: String,
    pub message_id: String,
    pub source_type: String,
    pub title: String,
    pub url: Option<String>,
    pub source_id: Option<String>,
    pub snippet: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateAiCitationInput {
    pub id: String,
    pub message_id: String,
    pub source_type: String,
    pub title: String,
    pub url: Option<String>,
    pub source_id: Option<String>,
    pub snippet: Option<String>,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiCanvasWorkspace {
    pub id: String,
    pub conversation_id: String,
    pub title: String,
    pub mode: String,
    pub active_version_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateAiCanvasWorkspaceInput {
    pub id: String,
    pub conversation_id: String,
    pub title: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateAiCanvasWorkspaceInput {
    pub title: Option<String>,
    pub mode: Option<String>,
    pub active_version_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiCanvasFile {
    pub id: String,
    pub workspace_id: String,
    pub path: String,
    pub language: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpsertAiCanvasFileInput {
    pub id: String,
    pub workspace_id: String,
    pub path: String,
    pub language: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiCanvasVersion {
    pub id: String,
    pub workspace_id: String,
    pub version_no: i64,
    pub snapshot_json: String,
    pub source_message_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateAiCanvasVersionInput {
    pub id: String,
    pub workspace_id: String,
    pub version_no: i64,
    pub snapshot_json: String,
    pub source_message_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiCanvasOperation {
    pub id: String,
    pub workspace_id: String,
    pub source_message_id: Option<String>,
    pub operation_type: String,
    pub payload_json: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateAiCanvasOperationInput {
    pub id: String,
    pub workspace_id: String,
    pub source_message_id: Option<String>,
    pub operation_type: String,
    pub payload_json: String,
    pub status: String,
}
