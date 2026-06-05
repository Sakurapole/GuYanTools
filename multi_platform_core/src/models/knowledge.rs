use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeLibrary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateKnowledgeLibraryInput {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateKnowledgeLibraryInput {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeSpace {
    pub id: String,
    pub library_id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub color: String,
    pub sort_order: i64,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateKnowledgeSpaceInput {
    pub library_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateKnowledgeSpaceInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeNode {
    pub id: String,
    pub library_id: String,
    pub space_id: Option<String>,
    pub parent_id: Option<String>,
    pub node_type: String,
    pub title: String,
    pub icon: Option<String>,
    pub sort_order: i64,
    pub is_archived: bool,
    pub is_favorite: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ListKnowledgeTreeInput {
    pub library_id: Option<String>,
    pub space_id: Option<String>,
    pub parent_id: Option<String>,
    pub include_archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateKnowledgeFolderInput {
    pub library_id: Option<String>,
    pub space_id: Option<String>,
    pub parent_id: Option<String>,
    pub title: String,
    pub icon: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgePage {
    pub id: String,
    pub page_type: String,
    pub content_markdown: String,
    pub content_json: Option<String>,
    pub content_text: String,
    pub properties_json: Option<String>,
    pub source_asset_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgePageDetail {
    pub node: KnowledgeNode,
    pub page: KnowledgePage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeQuickNote {
    pub id: String,
    pub library_id: String,
    pub node_id: String,
    pub title: String,
    pub body: String,
    pub tags_json: String,
    pub color: String,
    pub is_pinned: bool,
    pub converted_page_id: Option<String>,
    pub converted_todo_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeQuickNoteDetail {
    pub node: KnowledgeNode,
    pub quick_note: KnowledgeQuickNote,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ListKnowledgeQuickNotesInput {
    pub library_id: Option<String>,
    pub query: Option<String>,
    pub include_archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateKnowledgeQuickNoteInput {
    pub library_id: Option<String>,
    pub title: Option<String>,
    pub body: String,
    pub tags_json: Option<String>,
    pub color: Option<String>,
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateKnowledgeQuickNoteInput {
    pub title: Option<String>,
    pub body: Option<String>,
    pub tags_json: Option<String>,
    pub color: Option<String>,
    pub is_pinned: Option<bool>,
    pub converted_page_id: Option<String>,
    pub converted_todo_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ConvertKnowledgeQuickNoteToPageInput {
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeAsset {
    pub id: String,
    pub library_id: String,
    pub hash: String,
    pub original_name: String,
    pub mime_type: String,
    pub extension: String,
    pub size_bytes: i64,
    pub storage_path: String,
    pub original_path: Option<String>,
    pub preview_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub extracted_text: String,
    pub metadata_json: Option<String>,
    pub import_status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateKnowledgeAssetInput {
    pub library_id: Option<String>,
    pub hash: String,
    pub original_name: String,
    pub mime_type: Option<String>,
    pub extension: Option<String>,
    pub size_bytes: i64,
    pub storage_path: String,
    pub original_path: Option<String>,
    pub preview_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub extracted_text: Option<String>,
    pub metadata_json: Option<String>,
    pub import_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ImportKnowledgeDocumentInput {
    pub library_id: Option<String>,
    pub space_id: Option<String>,
    pub parent_id: Option<String>,
    pub hash: String,
    pub original_name: String,
    pub mime_type: Option<String>,
    pub extension: Option<String>,
    pub size_bytes: i64,
    pub storage_path: String,
    pub original_path: Option<String>,
    pub extracted_text: Option<String>,
    pub metadata_json: Option<String>,
    pub extraction_status: Option<String>,
    pub extraction_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ImportKnowledgeDocumentResult {
    pub asset: KnowledgeAsset,
    pub document: KnowledgePageDetail,
    pub index_job: KnowledgeIndexJob,
    pub duplicate_asset: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateKnowledgePageInput {
    pub library_id: Option<String>,
    pub space_id: Option<String>,
    pub parent_id: Option<String>,
    pub title: String,
    pub page_type: Option<String>,
    pub content_markdown: Option<String>,
    pub content_json: Option<String>,
    pub content_text: Option<String>,
    pub properties_json: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateKnowledgePageInput {
    pub title: Option<String>,
    pub content_markdown: Option<String>,
    pub content_json: Option<String>,
    pub content_text: Option<String>,
    pub properties_json: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct MoveKnowledgeNodeInput {
    pub parent_id: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateKnowledgeNodeInput {
    pub title: Option<String>,
    pub icon: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeIndexJob {
    pub id: String,
    pub job_type: String,
    pub target_type: String,
    pub target_id: String,
    pub status: String,
    pub progress: f64,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ListKnowledgeIndexJobsInput {
    pub target_type: Option<String>,
    pub target_id: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeSearchInput {
    pub library_id: Option<String>,
    pub space_id: Option<String>,
    pub query: String,
    pub source_type: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeSearchResult {
    pub source_type: String,
    pub source_id: String,
    pub node_id: Option<String>,
    pub asset_id: Option<String>,
    pub title: String,
    pub snippet: String,
    pub score: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeTag {
    pub id: String,
    pub library_id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ListKnowledgeTagsInput {
    pub library_id: Option<String>,
    pub target_type: Option<String>,
    pub target_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateKnowledgeTagInput {
    pub library_id: Option<String>,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateKnowledgeTagInput {
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct BindKnowledgeTagInput {
    pub tag_id: Option<String>,
    pub name: Option<String>,
    pub color: Option<String>,
    pub target_type: String,
    pub target_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UnbindKnowledgeTagInput {
    pub tag_id: String,
    pub target_type: String,
    pub target_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ListKnowledgeTagTargetsInput {
    pub tag_id: String,
    pub target_type: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeTaggedTarget {
    pub target_type: String,
    pub target_id: String,
    pub title: String,
    pub node_id: Option<String>,
    pub asset_id: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeLink {
    pub id: String,
    pub source_type: String,
    pub source_id: String,
    pub target_type: String,
    pub target_id: Option<String>,
    pub target_url: Option<String>,
    pub link_type: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeBacklink {
    pub id: String,
    pub source_type: String,
    pub source_id: String,
    pub source_title: String,
    pub source_node_id: Option<String>,
    pub link_type: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct LinkKnowledgeTodoInput {
    pub page_id: String,
    pub todo_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeGraphInput {
    pub library_id: Option<String>,
    pub space_id: Option<String>,
    pub tag_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeGraphNode {
    pub id: String,
    pub target_type: String,
    pub target_id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub color: Option<String>,
    pub group: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeGraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub link_type: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct KnowledgeGraph {
    pub nodes: Vec<KnowledgeGraphNode>,
    pub edges: Vec<KnowledgeGraphEdge>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ListKnowledgeOrphanPagesInput {
    pub library_id: Option<String>,
    pub space_id: Option<String>,
    pub limit: Option<i64>,
}
