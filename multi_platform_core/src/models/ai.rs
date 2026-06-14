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
    pub project_id: Option<String>,
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
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateAiConversationInput {
    pub title: Option<String>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub system_prompt: Option<String>,
    pub project_id: Option<String>,
    pub pinned: Option<bool>,
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiProject {
    pub id: String,
    pub name: String,
    pub instructions: Option<String>,
    pub knowledge_library_id: Option<String>,
    pub knowledge_space_id: Option<String>,
    pub include_global_memory: bool,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateAiProjectInput {
    pub id: String,
    pub name: String,
    pub instructions: Option<String>,
    pub knowledge_library_id: Option<String>,
    pub knowledge_space_id: Option<String>,
    pub include_global_memory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateAiProjectInput {
    pub name: Option<String>,
    pub instructions: Option<String>,
    pub knowledge_library_id: Option<String>,
    pub knowledge_space_id: Option<String>,
    pub include_global_memory: Option<bool>,
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiMemory {
    pub id: String,
    pub scope: String,
    pub scope_id: Option<String>,
    pub content: String,
    pub source_message_id: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateAiMemoryInput {
    pub id: String,
    pub scope: String,
    pub scope_id: Option<String>,
    pub content: String,
    pub source_message_id: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateAiMemoryInput {
    pub content: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ListAiMemoriesInput {
    pub scope: Option<String>,
    pub scope_id: Option<String>,
    pub enabled: Option<bool>,
    pub limit: Option<i64>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateAiCanvasOperationInput {
    pub payload_json: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiResearchJob {
    pub id: String,
    pub title: String,
    pub query: String,
    pub status: String,
    pub stage: String,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub progress: f64,
    pub report_markdown: Option<String>,
    pub error_message: Option<String>,
    pub options_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateAiResearchJobInput {
    pub id: String,
    pub title: String,
    pub query: String,
    pub status: String,
    pub stage: String,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub progress: f64,
    pub options_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateAiResearchJobInput {
    pub title: Option<String>,
    pub status: Option<String>,
    pub stage: Option<String>,
    pub progress: Option<f64>,
    pub report_markdown: Option<String>,
    pub error_message: Option<String>,
    pub options_json: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ListAiResearchJobsInput {
    pub status: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct AiResearchSource {
    pub id: String,
    pub job_id: String,
    pub source_type: String,
    pub title: String,
    pub url: Option<String>,
    pub source_id: Option<String>,
    pub snippet: Option<String>,
    pub summary: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateAiResearchSourceInput {
    pub id: String,
    pub job_id: String,
    pub source_type: String,
    pub title: String,
    pub url: Option<String>,
    pub source_id: Option<String>,
    pub snippet: Option<String>,
    pub summary: Option<String>,
    pub metadata_json: Option<String>,
}
