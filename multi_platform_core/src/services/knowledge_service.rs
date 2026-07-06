use crate::db::{Database, DbError, DbResult};
use crate::models::{
    BindKnowledgeTagInput, ConvertKnowledgeQuickNoteToPageInput, CreateKnowledgeAssetInput,
    CreateKnowledgeFolderInput, CreateKnowledgeLibraryInput, CreateKnowledgePageInput,
    CreateKnowledgeQuickNoteInput, CreateKnowledgeSpaceInput, CreateKnowledgeTagInput,
    ImportKnowledgeDocumentInput, ImportKnowledgeDocumentResult, KnowledgeAiChunk, KnowledgeAsset,
    KnowledgeBacklink, KnowledgeEmbeddingCandidate, KnowledgeEmbeddingStats, KnowledgeGraph,
    KnowledgeGraphEdge, KnowledgeGraphInput, KnowledgeGraphNode, KnowledgeIndexJob,
    KnowledgeLibrary, KnowledgeLink, KnowledgeNode, KnowledgePage, KnowledgePageDetail,
    KnowledgeQuickNote, KnowledgeQuickNoteDetail, KnowledgeSearchInput, KnowledgeSearchResult,
    KnowledgeSpace, KnowledgeTag, KnowledgeTaggedTarget, LinkKnowledgeTodoInput,
    ListKnowledgeAiChunksInput, ListKnowledgeEmbeddingCandidatesInput, ListKnowledgeIndexJobsInput,
    ListKnowledgeOrphanPagesInput, ListKnowledgeQuickNotesInput, ListKnowledgeTagTargetsInput,
    ListKnowledgeTagsInput, ListKnowledgeTreeInput, MoveKnowledgeNodeInput,
    UnbindKnowledgeTagInput, UpdateKnowledgeLibraryInput, UpdateKnowledgeNodeInput,
    UpdateKnowledgePageInput, UpdateKnowledgeQuickNoteInput, UpdateKnowledgeSpaceInput,
    UpdateKnowledgeTagInput, UpsertKnowledgeEmbeddingInput,
};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use uuid::Uuid;

pub struct KnowledgeService;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeSyncLibraryPayload {
    id: String,
    name: String,
    description: Option<String>,
    is_default: Option<bool>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeSyncSpacePayload {
    id: String,
    library_id: String,
    name: String,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    sort_order: Option<i64>,
    is_default: Option<bool>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeSyncNodePayload {
    id: String,
    library_id: String,
    space_id: Option<String>,
    parent_id: Option<String>,
    node_type: Option<String>,
    title: String,
    icon: Option<String>,
    sort_order: Option<i64>,
    is_archived: Option<bool>,
    is_favorite: Option<bool>,
    created_at: Option<String>,
    updated_at: Option<String>,
    deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeSyncPageRecordPayload {
    id: String,
    page_type: Option<String>,
    content_markdown: Option<String>,
    content_json: Option<String>,
    content_text: Option<String>,
    properties_json: Option<String>,
    source_asset_id: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeSyncPageObjectPayload {
    node: KnowledgeSyncNodePayload,
    page: KnowledgeSyncPageRecordPayload,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeSyncAssetPayload {
    id: String,
    library_id: String,
    hash: String,
    original_name: String,
    mime_type: Option<String>,
    extension: Option<String>,
    size_bytes: Option<i64>,
    storage_path: Option<String>,
    extracted_text: Option<String>,
    metadata_json: Option<String>,
    import_status: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeSyncTagPayload {
    id: String,
    library_id: String,
    name: String,
    color: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeSyncLinkPayload {
    id: String,
    source_type: String,
    source_id: String,
    target_type: String,
    target_id: Option<String>,
    target_url: Option<String>,
    link_type: Option<String>,
    created_at: Option<String>,
}

impl KnowledgeSyncNodePayload {
    fn from_node(node: KnowledgeNode) -> Self {
        Self {
            id: node.id,
            library_id: node.library_id,
            space_id: node.space_id,
            parent_id: node.parent_id,
            node_type: Some(node.node_type),
            title: node.title,
            icon: node.icon,
            sort_order: Some(node.sort_order),
            is_archived: Some(node.is_archived),
            is_favorite: Some(node.is_favorite),
            created_at: Some(node.created_at),
            updated_at: Some(node.updated_at),
            deleted_at: node.deleted_at,
        }
    }
}

impl KnowledgeService {
    const DEFAULT_LIBRARY_ID: &'static str = "library-default";
    const DEFAULT_SPACE_ID: &'static str = "space-default";
    const DEFAULT_INBOX_NODE_ID: &'static str = "node-inbox";

    pub fn apply_sync_object(
        db: &Database,
        collection: &str,
        payload_json: &str,
    ) -> DbResult<()> {
        db.transaction(|conn| {
            match collection {
                "knowledge.library" => {
                    let payload: KnowledgeSyncLibraryPayload = serde_json::from_str(payload_json)?;
                    Self::upsert_sync_library(conn, payload)?;
                }
                "knowledge.space" => {
                    let payload: KnowledgeSyncSpacePayload = serde_json::from_str(payload_json)?;
                    Self::upsert_sync_space(conn, payload)?;
                }
                "knowledge.folder" => {
                    let payload: KnowledgeSyncNodePayload = serde_json::from_str(payload_json)?;
                    Self::upsert_sync_node(conn, payload, "folder")?;
                }
                "knowledge.page" => {
                    let payload: serde_json::Value = serde_json::from_str(payload_json)?;
                    let detail = if payload.get("node").is_some() && payload.get("page").is_some() {
                        serde_json::from_value::<KnowledgeSyncPageObjectPayload>(payload)?
                    } else {
                        let page = serde_json::from_value::<KnowledgeSyncPageRecordPayload>(payload)?;
                        let node = Self::get_node(conn, &page.id)?;
                        KnowledgeSyncPageObjectPayload {
                            node: KnowledgeSyncNodePayload::from_node(node),
                            page,
                        }
                    };
                    Self::upsert_sync_page(conn, detail)?;
                }
                "knowledge.asset" => {
                    let payload: KnowledgeSyncAssetPayload = serde_json::from_str(payload_json)?;
                    Self::upsert_sync_asset(conn, payload)?;
                }
                "knowledge.tag" => {
                    let payload: KnowledgeSyncTagPayload = serde_json::from_str(payload_json)?;
                    Self::upsert_sync_tag(conn, payload)?;
                }
                "knowledge.link" => {
                    let payload: KnowledgeSyncLinkPayload = serde_json::from_str(payload_json)?;
                    Self::upsert_sync_link(conn, payload)?;
                }
                _ => {
                    return Err(DbError::InvalidParameter(format!(
                        "不支持的知识库同步集合: {}",
                        collection
                    )));
                }
            }
            Ok(())
        })
    }

    pub fn list_libraries(db: &Database) -> DbResult<Vec<KnowledgeLibrary>> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let mut stmt = conn.prepare(
                "SELECT id, name, description, is_default, created_at, updated_at
                 FROM knowledge_libraries
                 ORDER BY is_default DESC, created_at ASC",
            )?;
            let libraries = stmt
                .query_map([], Self::map_library)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(libraries)
        })
    }

    pub fn create_library(
        db: &Database,
        input: CreateKnowledgeLibraryInput,
    ) -> DbResult<KnowledgeLibrary> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let id = Self::new_id("library");
            let name = Self::normalize_required_text(input.name, "知识库名称不能为空")?;
            let description = Self::normalize_optional_text(input.description).unwrap_or_default();

            conn.execute(
                "INSERT INTO knowledge_libraries (id, name, description, is_default)
                 VALUES (?1, ?2, ?3, 0)",
                params![id, name, description],
            )?;
            Self::ensure_default_space_with_conn(conn, &id)?;
            Self::get_library(conn, &id)
        })
    }

    pub fn update_library(
        db: &Database,
        library_id: &str,
        input: UpdateKnowledgeLibraryInput,
    ) -> DbResult<KnowledgeLibrary> {
        db.transaction(|conn| {
            let current = Self::get_library(conn, library_id)?;
            let name = match input.name {
                Some(name) => Self::normalize_required_text(name, "知识库名称不能为空")?,
                None => current.name,
            };
            let description = input.description
                .and_then(|value| Some(value.trim().to_string()))
                .unwrap_or(current.description);

            conn.execute(
                "UPDATE knowledge_libraries
                 SET name = ?1, description = ?2, updated_at = datetime('now')
                 WHERE id = ?3",
                params![name, description, library_id],
            )?;
            Self::get_library(conn, library_id)
        })
    }

    pub fn delete_library(db: &Database, library_id: &str) -> DbResult<()> {
        db.transaction(|conn| {
            let library = Self::get_library(conn, library_id)?;
            if library.is_default {
                return Err(DbError::InvalidParameter("默认知识库不能删除".to_string()));
            }

            conn.execute(
                "DELETE FROM knowledge_search_fts WHERE library_id = ?1",
                params![library_id],
            )?;
            conn.execute("DELETE FROM knowledge_libraries WHERE id = ?1", params![library_id])?;
            Ok(())
        })
    }

    pub fn list_spaces(db: &Database, library_id: Option<String>) -> DbResult<Vec<KnowledgeSpace>> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let library_id = Self::resolve_library_id(conn, library_id)?;
            Self::ensure_default_space_with_conn(conn, &library_id)?;
            let mut stmt = conn.prepare(
                "SELECT id, library_id, name, description, icon, color, sort_order, is_default, created_at, updated_at
                 FROM knowledge_spaces
                 WHERE library_id = ?1
                 ORDER BY sort_order ASC, is_default DESC, created_at ASC",
            )?;
            let spaces = stmt
                .query_map(params![library_id], Self::map_space)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(spaces)
        })
    }

    pub fn create_space(
        db: &Database,
        input: CreateKnowledgeSpaceInput,
    ) -> DbResult<KnowledgeSpace> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let library_id = Self::resolve_library_id(conn, input.library_id)?;
            let id = Self::new_id("space");
            let name = Self::normalize_required_text(input.name, "空间名称不能为空")?;
            let description = Self::normalize_optional_text(input.description).unwrap_or_default();
            let icon = Self::normalize_optional_text(input.icon).unwrap_or_else(|| "library".to_string());
            let color = Self::normalize_optional_text(input.color).unwrap_or_else(|| "#4A90D9".to_string());
            let sort_order = input
                .sort_order
                .unwrap_or_else(|| Self::next_space_sort_order(conn, &library_id).unwrap_or(0));

            conn.execute(
                "INSERT INTO knowledge_spaces (id, library_id, name, description, icon, color, sort_order, is_default)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
                params![id, library_id, name, description, icon, color, sort_order],
            )?;
            Self::get_space(conn, &id)
        })
    }

    pub fn update_space(
        db: &Database,
        space_id: &str,
        input: UpdateKnowledgeSpaceInput,
    ) -> DbResult<KnowledgeSpace> {
        db.transaction(|conn| {
            let current = Self::get_space(conn, space_id)?;
            let name = match input.name {
                Some(name) => Self::normalize_required_text(name, "空间名称不能为空")?,
                None => current.name,
            };
            let description = input.description
                .and_then(|value| Some(value.trim().to_string()))
                .unwrap_or(current.description);
            let icon = Self::normalize_optional_text(input.icon).unwrap_or(current.icon);
            let color = Self::normalize_optional_text(input.color).unwrap_or(current.color);
            let sort_order = input.sort_order.unwrap_or(current.sort_order);

            conn.execute(
                "UPDATE knowledge_spaces
                 SET name = ?1, description = ?2, icon = ?3, color = ?4, sort_order = ?5, updated_at = datetime('now')
                 WHERE id = ?6",
                params![name, description, icon, color, sort_order, space_id],
            )?;
            Self::get_space(conn, space_id)
        })
    }

    pub fn delete_space(db: &Database, space_id: &str) -> DbResult<()> {
        db.transaction(|conn| {
            let space = Self::get_space(conn, space_id)?;
            if space.is_default {
                return Err(DbError::InvalidParameter("默认空间不能删除".to_string()));
            }

            conn.execute(
                "UPDATE knowledge_nodes
                 SET is_archived = 1, deleted_at = datetime('now'), updated_at = datetime('now')
                 WHERE space_id = ?1",
                params![space_id],
            )?;
            conn.execute(
                "DELETE FROM knowledge_search_fts WHERE library_id = ?1 AND node_id IN (
                    SELECT id FROM knowledge_nodes WHERE space_id = ?2
                 )",
                params![space.library_id, space_id],
            )?;
            conn.execute("DELETE FROM knowledge_spaces WHERE id = ?1", params![space_id])?;
            Ok(())
        })
    }

    pub fn list_tree(
        db: &Database,
        input: Option<ListKnowledgeTreeInput>,
    ) -> DbResult<Vec<KnowledgeNode>> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let input = input.unwrap_or(ListKnowledgeTreeInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                include_archived: None,
            });
            let library_id = Self::resolve_library_id(conn, input.library_id)?;
            let space_id = Self::normalize_optional_text(input.space_id);
            let parent_id = Self::normalize_optional_text(input.parent_id);
            let include_archived = input.include_archived.unwrap_or(false);

            let mut stmt = conn.prepare(
                "SELECT id, library_id, space_id, parent_id, node_type, title, icon, sort_order,
                        is_archived, is_favorite, created_at, updated_at, deleted_at
                 FROM knowledge_nodes
                 WHERE library_id = ?1
                   AND (?2 IS NULL OR space_id = ?2)
                   AND (?3 IS NULL OR parent_id = ?3)
                   AND (?4 = 1 OR is_archived = 0)
                   AND deleted_at IS NULL
                  ORDER BY COALESCE(parent_id, ''), sort_order ASC, created_at ASC",
            )?;
            let nodes = stmt
                .query_map(
                    params![library_id, space_id, parent_id, include_archived as i64],
                    Self::map_node,
                )?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(nodes)
        })
    }

    pub fn create_folder(
        db: &Database,
        input: CreateKnowledgeFolderInput,
    ) -> DbResult<KnowledgeNode> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let parent_id = Self::normalize_optional_text(input.parent_id);
            let (library_id, space_id) = Self::resolve_node_scope(
                conn,
                input.library_id,
                input.space_id,
                parent_id.as_deref(),
            )?;
            let id = Self::new_id("node");
            let title = Self::normalize_required_text(input.title, "文件夹名称不能为空")?;
            let icon = Self::normalize_optional_text(input.icon).or_else(|| Some("folder".to_string()));
            let sort_order = input.sort_order.unwrap_or(0);

            conn.execute(
                "INSERT INTO knowledge_nodes (id, library_id, space_id, parent_id, node_type, title, icon, sort_order)
                 VALUES (?1, ?2, ?3, ?4, 'folder', ?5, ?6, ?7)",
                params![id, library_id, space_id, parent_id, title, icon, sort_order],
            )?;
            Self::get_node(conn, &id)
        })
    }

    pub fn create_page(
        db: &Database,
        input: CreateKnowledgePageInput,
    ) -> DbResult<KnowledgePageDetail> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let parent_id = Self::normalize_optional_text(input.parent_id);
            let (library_id, space_id) = Self::resolve_node_scope(
                conn,
                input.library_id,
                input.space_id,
                parent_id.as_deref(),
            )?;
            let id = Self::new_id("page");
            let title = Self::normalize_required_text(input.title, "页面标题不能为空")?;
            let page_type = Self::normalize_page_type(input.page_type)?;
            let icon = Self::page_icon(&page_type);
            let content_markdown = input.content_markdown.unwrap_or_default();
            let content_text = input
                .content_text
                .unwrap_or_else(|| content_markdown.clone());
            let content_json = Self::normalize_optional_text(input.content_json);
            let properties_json = Self::normalize_optional_text(input.properties_json);
            let sort_order = input.sort_order.unwrap_or(0);

            conn.execute(
                "INSERT INTO knowledge_nodes (id, library_id, space_id, parent_id, node_type, title, icon, sort_order)
                 VALUES (?1, ?2, ?3, ?4, 'page', ?5, ?6, ?7)",
                params![id, library_id, space_id, parent_id, title, icon, sort_order],
            )?;
            conn.execute(
                "INSERT INTO knowledge_pages (id, page_type, content_markdown, content_json, content_text, properties_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, page_type, content_markdown, content_json, content_text, properties_json],
            )?;
            let detail = Self::get_page_detail(conn, &id)?;
            Self::upsert_search_document(
                conn,
                &detail.node.library_id,
                "page",
                &detail.node.id,
                Some(&detail.node.id),
                None,
                &detail.node.title,
                &detail.page.content_text,
                "",
                detail.page.properties_json.as_deref().unwrap_or(""),
            )?;
            Self::sync_page_wikilinks(conn, &detail)?;
            Ok(detail)
        })
    }

    pub fn get_page(db: &Database, page_id: &str) -> DbResult<KnowledgePageDetail> {
        db.with_connection(|conn| Self::get_page_detail(conn, page_id))
    }

    pub fn list_quick_notes(
        db: &Database,
        input: Option<ListKnowledgeQuickNotesInput>,
    ) -> DbResult<Vec<KnowledgeQuickNoteDetail>> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let input = input.unwrap_or(ListKnowledgeQuickNotesInput {
                library_id: None,
                query: None,
                include_archived: None,
            });
            let library_id = Self::resolve_library_id(conn, input.library_id)?;
            let include_archived = input.include_archived.unwrap_or(false);
            let query = Self::normalize_optional_text(input.query)
                .map(|query| format!("%{}%", query.to_lowercase()));

            let mut stmt = conn.prepare(
                "SELECT
                    n.id, n.library_id, n.space_id, n.parent_id, n.node_type, n.title, n.icon,
                    n.sort_order, n.is_archived, n.is_favorite, n.created_at, n.updated_at, n.deleted_at,
                    q.id, q.library_id, q.node_id, q.title, q.body, q.tags_json, q.color,
                    q.is_pinned, q.converted_page_id, q.converted_todo_id, q.created_at, q.updated_at
                 FROM knowledge_quick_notes q
                 INNER JOIN knowledge_nodes n ON n.id = q.node_id
                 WHERE q.library_id = ?1
                   AND (?2 = 1 OR n.is_archived = 0)
                   AND n.deleted_at IS NULL
                   AND (
                     ?3 IS NULL
                     OR lower(n.title) LIKE ?3
                     OR lower(q.body) LIKE ?3
                     OR lower(q.tags_json) LIKE ?3
                   )
                 ORDER BY q.is_pinned DESC, q.updated_at DESC, q.created_at DESC",
            )?;

            let notes = stmt
                .query_map(params![library_id, include_archived as i64, query], |row| {
                    Ok(KnowledgeQuickNoteDetail {
                        node: Self::map_node_at(row, 0)?,
                        quick_note: Self::map_quick_note_at(row, 13)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(notes)
        })
    }

    pub fn create_quick_note(
        db: &Database,
        input: CreateKnowledgeQuickNoteInput,
    ) -> DbResult<KnowledgeQuickNoteDetail> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let library_id = Self::resolve_library_id(conn, input.library_id)?;
            let inbox = Self::get_node(conn, Self::DEFAULT_INBOX_NODE_ID)?;
            let id = Self::new_id("quick-note");
            let body = Self::normalize_required_text(input.body, "速记内容不能为空")?;
            let title = match input.title {
                Some(title) => Self::normalize_required_text(title, "速记标题不能为空")?,
                None => Self::quick_note_title_from_body(&body),
            };
            let tags_json = Self::normalize_tags_json(input.tags_json)?;
            let color = Self::normalize_quick_note_color(input.color)?;
            let is_pinned = input.is_pinned.unwrap_or(false);

            conn.execute(
                "INSERT INTO knowledge_nodes (id, library_id, space_id, parent_id, node_type, title, icon, sort_order)
                 VALUES (?1, ?2, ?3, ?4, 'quick_note', ?5, 'sticky-note', 0)",
                params![id, library_id, inbox.space_id, Self::DEFAULT_INBOX_NODE_ID, title],
            )?;
            conn.execute(
                "INSERT INTO knowledge_quick_notes (
                    id, library_id, node_id, title, body, tags_json, color, is_pinned
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![id, library_id, id, title, body, tags_json, color, is_pinned as i64],
            )?;
            let detail = Self::get_quick_note_detail(conn, &id)?;
            Self::upsert_search_document(
                conn,
                &detail.quick_note.library_id,
                "quick_note",
                &detail.quick_note.id,
                Some(&detail.node.id),
                None,
                &detail.quick_note.title,
                &detail.quick_note.body,
                &detail.quick_note.tags_json,
                "",
            )?;
            Ok(detail)
        })
    }

    pub fn update_quick_note(
        db: &Database,
        note_id: &str,
        input: UpdateKnowledgeQuickNoteInput,
    ) -> DbResult<KnowledgeQuickNoteDetail> {
        db.transaction(|conn| {
            let current = Self::get_quick_note_detail(conn, note_id)?;
            let title = match input.title {
                Some(title) => Self::normalize_required_text(title, "速记标题不能为空")?,
                None => current.quick_note.title,
            };
            let body = input.body.unwrap_or(current.quick_note.body);
            let tags_json = match input.tags_json {
                Some(tags_json) => Self::normalize_tags_json(Some(tags_json))?,
                None => current.quick_note.tags_json,
            };
            let color = match input.color {
                Some(color) => Self::normalize_quick_note_color(Some(color))?,
                None => current.quick_note.color,
            };
            let is_pinned = input.is_pinned.unwrap_or(current.quick_note.is_pinned);
            let converted_page_id = input
                .converted_page_id
                .or(current.quick_note.converted_page_id);
            let converted_todo_id = input
                .converted_todo_id
                .or(current.quick_note.converted_todo_id);

            conn.execute(
                "UPDATE knowledge_nodes
                 SET title = ?1, updated_at = datetime('now')
                 WHERE id = ?2 AND node_type = 'quick_note'",
                params![title, note_id],
            )?;
            conn.execute(
                "UPDATE knowledge_quick_notes
                 SET title = ?1, body = ?2, tags_json = ?3, color = ?4, is_pinned = ?5,
                     converted_page_id = ?6, converted_todo_id = ?7, updated_at = datetime('now')
                 WHERE id = ?8",
                params![
                    title,
                    body,
                    tags_json,
                    color,
                    is_pinned as i64,
                    converted_page_id,
                    converted_todo_id,
                    note_id
                ],
            )?;
            let detail = Self::get_quick_note_detail(conn, note_id)?;
            Self::upsert_search_document(
                conn,
                &detail.quick_note.library_id,
                "quick_note",
                &detail.quick_note.id,
                Some(&detail.node.id),
                None,
                &detail.quick_note.title,
                &detail.quick_note.body,
                &detail.quick_note.tags_json,
                "",
            )?;
            Ok(detail)
        })
    }

    pub fn archive_quick_note(db: &Database, note_id: &str) -> DbResult<KnowledgeQuickNoteDetail> {
        db.transaction(|conn| {
            Self::get_quick_note_detail(conn, note_id)?;
            conn.execute(
                "UPDATE knowledge_nodes
                 SET is_archived = 1, updated_at = datetime('now')
                 WHERE id = ?1 AND node_type = 'quick_note'",
                params![note_id],
            )?;
            conn.execute(
                "DELETE FROM knowledge_search_fts WHERE source_type = 'quick_note' AND source_id = ?1",
                params![note_id],
            )?;
            Self::get_quick_note_detail(conn, note_id)
        })
    }

    pub fn convert_quick_note_to_page(
        db: &Database,
        note_id: &str,
        input: ConvertKnowledgeQuickNoteToPageInput,
    ) -> DbResult<KnowledgePageDetail> {
        db.transaction(|conn| {
            let note_detail = Self::get_quick_note_detail(conn, note_id)?;
            if let Some(page_id) = note_detail.quick_note.converted_page_id {
                return Self::get_page_detail(conn, &page_id);
            }

            let page_id = Self::new_id("page");
            let title = match input.title {
                Some(title) => Self::normalize_required_text(title, "页面标题不能为空")?,
                None => note_detail.quick_note.title.clone(),
            };
            let content_markdown = Self::quick_note_to_markdown(&note_detail.quick_note);
            let content_text = note_detail.quick_note.body.clone();

            conn.execute(
                "INSERT INTO knowledge_nodes (id, library_id, space_id, parent_id, node_type, title, icon, sort_order)
                 VALUES (?1, ?2, ?3, ?4, 'page', ?5, 'file-text', 0)",
                params![
                    page_id,
                    note_detail.node.library_id,
                    note_detail.node.space_id,
                    note_detail.node.parent_id,
                    title
                ],
            )?;
            conn.execute(
                "INSERT INTO knowledge_pages (id, page_type, content_markdown, content_text, properties_json)
                 VALUES (?1, 'markdown', ?2, ?3, ?4)",
                params![
                    page_id,
                    content_markdown,
                    content_text,
                    format!(r#"{{"sourceType":"quick_note","sourceId":"{}"}}"#, note_id)
                ],
            )?;
            conn.execute(
                "UPDATE knowledge_quick_notes
                 SET converted_page_id = ?1, updated_at = datetime('now')
                 WHERE id = ?2",
                params![page_id, note_id],
            )?;
            Self::insert_knowledge_link(conn, "quick_note", note_id, "page", Some(&page_id), "converted_to")?;
            Self::insert_knowledge_link(conn, "page", &page_id, "quick_note", Some(note_id), "source")?;
            let detail = Self::get_page_detail(conn, &page_id)?;
            Self::upsert_search_document(
                conn,
                &detail.node.library_id,
                "page",
                &detail.node.id,
                Some(&detail.node.id),
                None,
                &detail.node.title,
                &detail.page.content_text,
                "",
                detail.page.properties_json.as_deref().unwrap_or(""),
            )?;
            Ok(detail)
        })
    }

    pub fn link_quick_note_todo(
        db: &Database,
        note_id: &str,
        todo_id: &str,
    ) -> DbResult<KnowledgeQuickNoteDetail> {
        db.transaction(|conn| {
            Self::get_quick_note_detail(conn, note_id)?;
            conn.execute(
                "UPDATE knowledge_quick_notes
                 SET converted_todo_id = ?1, updated_at = datetime('now')
                 WHERE id = ?2",
                params![todo_id, note_id],
            )?;
            Self::insert_knowledge_link(
                conn,
                "quick_note",
                note_id,
                "todo",
                Some(todo_id),
                "converted_to",
            )?;
            Self::insert_knowledge_link(
                conn,
                "todo",
                todo_id,
                "quick_note",
                Some(note_id),
                "source",
            )?;
            Self::get_quick_note_detail(conn, note_id)
        })
    }

    pub fn create_asset(
        db: &Database,
        input: CreateKnowledgeAssetInput,
    ) -> DbResult<KnowledgeAsset> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let library_id = Self::resolve_library_id(conn, input.library_id)?;
            let id = Self::new_id("asset");
            let hash = Self::normalize_required_text(input.hash, "资产 hash 不能为空")?;
            let original_name =
                Self::normalize_required_text(input.original_name, "资产文件名不能为空")?;
            let mime_type = Self::normalize_optional_text(input.mime_type).unwrap_or_default();
            let extension = Self::normalize_optional_text(input.extension).unwrap_or_default();
            let storage_path =
                Self::normalize_required_text(input.storage_path, "资产存储路径不能为空")?;
            let original_path = Self::normalize_optional_text(input.original_path);
            let preview_path = Self::normalize_optional_text(input.preview_path);
            let thumbnail_path = Self::normalize_optional_text(input.thumbnail_path);
            let extracted_text =
                Self::normalize_optional_text(input.extracted_text).unwrap_or_default();
            let metadata_json = Self::normalize_optional_text(input.metadata_json);
            let import_status = Self::normalize_import_status(input.import_status)?;

            conn.execute(
                "INSERT INTO knowledge_assets (
                    id, library_id, hash, original_name, mime_type, extension, size_bytes,
                    storage_path, original_path, preview_path, thumbnail_path, extracted_text,
                    metadata_json, import_status
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    id,
                    library_id,
                    hash,
                    original_name,
                    mime_type,
                    extension,
                    input.size_bytes,
                    storage_path,
                    original_path,
                    preview_path,
                    thumbnail_path,
                    extracted_text,
                    metadata_json,
                    import_status
                ],
            )?;
            Self::get_asset(conn, &id)
        })
    }

    pub fn get_asset_by_id(db: &Database, asset_id: &str) -> DbResult<KnowledgeAsset> {
        db.with_connection(|conn| Self::get_asset(conn, asset_id))
    }

    pub fn import_document(
        db: &Database,
        input: ImportKnowledgeDocumentInput,
    ) -> DbResult<ImportKnowledgeDocumentResult> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let parent_id = Self::normalize_optional_text(input.parent_id);
            let (library_id, space_id) = Self::resolve_node_scope(
                conn,
                input.library_id,
                input.space_id,
                parent_id.as_deref(),
            )?;
            let hash = Self::normalize_required_text(input.hash, "导入文件 hash 不能为空")?;
            let original_name =
                Self::normalize_required_text(input.original_name, "导入文件名不能为空")?;
            let mime_type = Self::normalize_optional_text(input.mime_type).unwrap_or_default();
            let extension = Self::normalize_optional_text(input.extension).unwrap_or_default();
            let is_markdown_import = Self::is_markdown_import(&extension, &mime_type);
            let storage_path =
                Self::normalize_required_text(input.storage_path, "导入文件存储路径不能为空")?;
            let original_path = Self::normalize_optional_text(input.original_path);
            let extracted_text = Self::normalize_optional_text(input.extracted_text).unwrap_or_default();
            let extraction_status = Self::normalize_index_status(input.extraction_status)?;
            let extraction_error = Self::normalize_optional_text(input.extraction_error);
            let mut metadata = input.metadata_json.unwrap_or_else(|| "{}".to_string());
            if serde_json::from_str::<serde_json::Value>(&metadata).is_err() {
                metadata = "{}".to_string();
            }
            let import_status = if extraction_status == "failed" {
                "failed"
            } else {
                "ready"
            };

            let duplicate_asset = Self::get_asset_by_hash(conn, &library_id, &hash)?.is_some();
            let asset = if let Some(existing) = Self::get_asset_by_hash(conn, &library_id, &hash)? {
                conn.execute(
                    "UPDATE knowledge_assets
                     SET original_path = COALESCE(original_path, ?1),
                         extracted_text = CASE WHEN ?2 <> '' THEN ?2 ELSE extracted_text END,
                         metadata_json = ?3,
                         import_status = ?4,
                         updated_at = datetime('now')
                     WHERE id = ?5",
                    params![original_path, extracted_text, metadata, import_status, existing.id],
                )?;
                Self::get_asset(conn, &existing.id)?
            } else {
                let id = Self::new_id("asset");
                conn.execute(
                    "INSERT INTO knowledge_assets (
                        id, library_id, hash, original_name, mime_type, extension, size_bytes,
                        storage_path, original_path, extracted_text, metadata_json, import_status
                     )
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    params![
                        id,
                        library_id,
                        hash,
                        original_name,
                        mime_type,
                        extension,
                        input.size_bytes,
                        storage_path,
                        original_path,
                        extracted_text,
                        metadata,
                        import_status
                    ],
                )?;
                Self::get_asset(conn, &id)?
            };

            let title = Self::document_title_from_name(&asset.original_name);
            let document = if let Some(document_id) = Self::get_document_id_by_asset(conn, &asset.id)? {
                if is_markdown_import {
                    conn.execute(
                        "UPDATE knowledge_pages
                         SET page_type = 'markdown',
                             content_markdown = ?1,
                             content_text = ?1,
                             properties_json = ?2,
                             updated_at = datetime('now')
                         WHERE id = ?3",
                        params![asset.extracted_text, asset.metadata_json, document_id],
                    )?;
                    conn.execute(
                        "UPDATE knowledge_nodes
                         SET node_type = 'page', icon = ?1, updated_at = datetime('now')
                         WHERE id = ?2",
                        params![Self::document_icon(&asset.extension), document_id],
                    )?;
                } else {
                    conn.execute(
                        "UPDATE knowledge_pages
                         SET content_text = ?1, properties_json = ?2, updated_at = datetime('now')
                         WHERE id = ?3",
                        params![asset.extracted_text, asset.metadata_json, document_id],
                    )?;
                }
                Self::get_page_detail(conn, &document_id)?
            } else {
                let node_id = Self::new_id(if is_markdown_import { "page" } else { "document" });
                let node_type = if is_markdown_import { "page" } else { "document" };
                let page_type = if is_markdown_import { "markdown" } else { "external_document" };
                let content_markdown = if is_markdown_import {
                    asset.extracted_text.clone()
                } else {
                    format!(
                        "# {}\n\n> 导入文档，原文件作为知识库资产保存。\n",
                        title
                    )
                };
                conn.execute(
                    "INSERT INTO knowledge_nodes (id, library_id, space_id, parent_id, node_type, title, icon, sort_order)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
                    params![
                        node_id,
                        asset.library_id,
                        space_id,
                        parent_id,
                        node_type,
                        title,
                        Self::document_icon(&asset.extension)
                    ],
                )?;
                conn.execute(
                    "INSERT INTO knowledge_pages (
                        id, page_type, content_markdown, content_text, properties_json, source_asset_id
                     )
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        node_id,
                        page_type,
                        content_markdown,
                        asset.extracted_text,
                        asset.metadata_json,
                        asset.id
                    ],
                )?;
                Self::insert_knowledge_link(conn, node_type, &node_id, "asset", Some(&asset.id), "source")?;
                Self::insert_knowledge_link(conn, "asset", &asset.id, node_type, Some(&node_id), "owned_by")?;
                Self::get_page_detail(conn, &node_id)?
            };
            let search_source_type = if document.node.node_type == "document" { "document" } else { "page" };

            let job = Self::create_index_job(
                conn,
                "extract_text",
                "asset",
                &asset.id,
                if extraction_status == "failed" {
                    "failed"
                } else if extraction_status == "cancelled" {
                    "cancelled"
                } else {
                    "succeeded"
                },
                1.0,
                extraction_error,
            )?;
            if extraction_status != "failed" {
                Self::upsert_search_document(
                    conn,
                    &asset.library_id,
                    search_source_type,
                    &document.node.id,
                    Some(&document.node.id),
                    Some(&asset.id),
                    &document.node.title,
                    &asset.extracted_text,
                    "",
                    asset.metadata_json.as_deref().unwrap_or(""),
                )?;
            } else {
                Self::upsert_search_document(
                    conn,
                    &asset.library_id,
                    search_source_type,
                    &document.node.id,
                    Some(&document.node.id),
                    Some(&asset.id),
                    &document.node.title,
                    "",
                    "",
                    asset.metadata_json.as_deref().unwrap_or(""),
                )?;
            }
            if is_markdown_import {
                Self::sync_page_wikilinks(conn, &document)?;
            }
            Self::upsert_search_document(
                conn,
                &asset.library_id,
                "asset",
                &asset.id,
                Some(&document.node.id),
                Some(&asset.id),
                &asset.original_name,
                &asset.extracted_text,
                "",
                asset.metadata_json.as_deref().unwrap_or(""),
            )?;

            Ok(ImportKnowledgeDocumentResult {
                asset,
                document,
                index_job: job,
                duplicate_asset,
            })
        })
    }

    pub fn list_index_jobs(
        db: &Database,
        input: Option<ListKnowledgeIndexJobsInput>,
    ) -> DbResult<Vec<KnowledgeIndexJob>> {
        db.with_connection(|conn| {
            let input = input.unwrap_or(ListKnowledgeIndexJobsInput {
                target_type: None,
                target_id: None,
                status: None,
                limit: None,
            });
            let target_type = Self::normalize_optional_text(input.target_type);
            let target_id = Self::normalize_optional_text(input.target_id);
            let status = Self::normalize_optional_text(input.status);
            let limit = input.limit.unwrap_or(50).clamp(1, 200);
            let mut stmt = conn.prepare(
                "SELECT id, job_type, target_type, target_id, status, progress, error_message,
                        created_at, updated_at
                 FROM knowledge_index_jobs
                 WHERE (?1 IS NULL OR target_type = ?1)
                   AND (?2 IS NULL OR target_id = ?2)
                   AND (?3 IS NULL OR status = ?3)
                 ORDER BY created_at DESC
                 LIMIT ?4",
            )?;
            let jobs = stmt
                .query_map(
                    params![target_type, target_id, status, limit],
                    Self::map_index_job,
                )?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(jobs)
        })
    }

    pub fn get_index_job_by_id(db: &Database, job_id: &str) -> DbResult<KnowledgeIndexJob> {
        let job_id = Self::normalize_required_text(job_id.to_string(), "索引任务 ID 不能为空")?;
        db.with_connection(|conn| Self::get_index_job(conn, &job_id))
    }

    pub fn cancel_index_job(db: &Database, job_id: &str) -> DbResult<KnowledgeIndexJob> {
        let job_id = Self::normalize_required_text(job_id.to_string(), "索引任务 ID 不能为空")?;
        db.with_connection(|conn| {
            let job = Self::get_index_job(conn, &job_id)?;
            if matches!(job.status.as_str(), "succeeded" | "cancelled") {
                return Ok(job);
            }

            conn.execute(
                "UPDATE knowledge_index_jobs
                 SET status = 'cancelled',
                     progress = 1.0,
                     error_message = COALESCE(error_message, '用户取消'),
                     updated_at = datetime('now')
                 WHERE id = ?1",
                params![job_id],
            )?;
            Self::get_index_job(conn, &job_id)
        })
    }

    pub fn search_knowledge(
        db: &Database,
        input: KnowledgeSearchInput,
    ) -> DbResult<Vec<KnowledgeSearchResult>> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let library_id = Self::resolve_library_id(conn, input.library_id)?;
            let query = Self::normalize_required_text(input.query, "搜索关键词不能为空")?;
            Self::backfill_search_index(conn, &library_id)?;
            let source_type = Self::normalize_search_source_type(input.source_type)?;
            let space_id = Self::normalize_optional_text(input.space_id);
            let limit = input.limit.unwrap_or(30).clamp(1, 100);
            let like_query = format!("%{}%", query.to_lowercase());
            let query_lower = query.to_lowercase();

            let mut stmt = conn.prepare(
                "SELECT f.source_type, f.source_id, f.node_id, f.asset_id, f.title, f.body, f.tags,
                        f.metadata,
                        COALESCE(n.updated_at, a.updated_at, q.updated_at, datetime('now')) AS updated_at
                 FROM knowledge_search_fts f
                 LEFT JOIN knowledge_nodes n ON n.id = f.node_id
                 LEFT JOIN knowledge_assets a ON a.id = f.asset_id
                 LEFT JOIN knowledge_quick_notes q ON q.id = f.source_id
                 WHERE f.library_id = ?1
                   AND (?2 IS NULL OR n.space_id = ?2 OR n.id IS NULL)
                   AND (?3 IS NULL OR f.source_type = ?3)
                   AND (?3 IS NOT NULL OR f.source_type <> 'asset')
                   AND (n.deleted_at IS NULL OR n.id IS NULL)
                   AND (n.is_archived = 0 OR n.id IS NULL)
                   AND (
                     lower(f.title) LIKE ?4
                     OR lower(f.body) LIKE ?4
                     OR lower(f.tags) LIKE ?4
                     OR lower(f.metadata) LIKE ?4
                   )",
            )?;

            let mut results = stmt
                .query_map(params![library_id, space_id, source_type, like_query], |row| {
                    let source_type: String = row.get(0)?;
                    let source_id: String = row.get(1)?;
                    let node_id: Option<String> = row.get(2)?;
                    let asset_id: Option<String> = row.get(3)?;
                    let title: String = row.get(4)?;
                    let body: String = row.get(5)?;
                    let tags: String = row.get(6)?;
                    let metadata: String = row.get(7)?;
                    let updated_at: String = row.get(8)?;
                    let score = Self::score_search_result(&query_lower, &title, &body, &tags, &metadata);
                    let snippet = Self::build_snippet(&query_lower, &[&body, &tags, &metadata, &title]);
                    Ok(KnowledgeSearchResult {
                        source_type,
                        source_id,
                        node_id,
                        asset_id,
                        title,
                        snippet,
                        score,
                        updated_at,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            results.sort_by(|left, right| {
                right
                    .score
                    .partial_cmp(&left.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| right.updated_at.cmp(&left.updated_at))
            });
            results.truncate(limit as usize);
            Ok(results)
        })
    }

    pub fn list_ai_chunks(
        db: &Database,
        input: Option<ListKnowledgeAiChunksInput>,
    ) -> DbResult<Vec<KnowledgeAiChunk>> {
        db.with_connection(|conn| {
            let input = input.unwrap_or(ListKnowledgeAiChunksInput {
                source_type: None,
                source_id: None,
                missing_embedding_provider: None,
                missing_embedding_model: None,
                limit: None,
            });
            let source_type = Self::normalize_optional_text(input.source_type);
            let source_id = Self::normalize_optional_text(input.source_id);
            let missing_provider = Self::normalize_optional_text(input.missing_embedding_provider);
            let missing_model = Self::normalize_optional_text(input.missing_embedding_model);
            let missing_enabled = missing_provider.is_some() && missing_model.is_some();
            let limit = input.limit.unwrap_or(500).clamp(1, 5000);

            let mut stmt = conn.prepare(
                "SELECT id, source_type, source_id, chunk_index, content_text, token_count, metadata_json, created_at
                 FROM knowledge_ai_chunks c
                 WHERE (?1 IS NULL OR c.source_type = ?1)
                   AND (?2 IS NULL OR c.source_id = ?2)
                   AND (
                     ?3 = 0
                     OR NOT EXISTS (
                       SELECT 1 FROM knowledge_embeddings e
                       WHERE e.chunk_id = c.id AND e.provider = ?4 AND e.model = ?5
                     )
                   )
                 ORDER BY source_type ASC, source_id ASC, chunk_index ASC
                 LIMIT ?6",
            )?;
            let rows = stmt
                .query_map(
                    params![
                        source_type,
                        source_id,
                        missing_enabled as i64,
                        missing_provider,
                        missing_model,
                        limit
                    ],
                    Self::map_ai_chunk,
                )?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn upsert_embedding(db: &Database, input: UpsertKnowledgeEmbeddingInput) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO knowledge_embeddings (
                    id, chunk_id, provider, model, dimension, vector_blob
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(chunk_id, provider, model) DO UPDATE SET
                    dimension = excluded.dimension,
                    vector_blob = excluded.vector_blob,
                    created_at = datetime('now')",
                params![
                    input.id,
                    input.chunk_id,
                    input.provider,
                    input.model,
                    input.dimension,
                    input.vector_blob
                ],
            )?;
            Ok(())
        })
    }

    pub fn delete_embeddings(db: &Database, provider: &str, model: &str) -> DbResult<i64> {
        db.with_connection(|conn| {
            let deleted = conn.execute(
                "DELETE FROM knowledge_embeddings WHERE provider = ?1 AND model = ?2",
                params![provider, model],
            )?;
            Ok(deleted as i64)
        })
    }

    pub fn list_embedding_candidates(
        db: &Database,
        input: ListKnowledgeEmbeddingCandidatesInput,
    ) -> DbResult<Vec<KnowledgeEmbeddingCandidate>> {
        db.with_connection(|conn| {
            let provider = Self::normalize_required_text(input.provider, "Provider 不能为空")?;
            let model = Self::normalize_required_text(input.model, "模型不能为空")?;
            let library_id = Self::normalize_optional_text(input.library_id);
            let space_id = Self::normalize_optional_text(input.space_id);
            let source_type = Self::normalize_optional_text(input.source_type);
            let limit = input.limit.unwrap_or(2000).clamp(1, 10000);
            let mut stmt = conn.prepare(
                "SELECT c.id,
                        c.source_type,
                        c.source_id,
                        f.node_id,
                        f.asset_id,
                        COALESCE(NULLIF(f.title, ''), n.title, a.original_name, c.source_id) AS title,
                        c.content_text,
                        c.metadata_json,
                        COALESCE(n.updated_at, a.updated_at, datetime('now')) AS updated_at,
                        e.vector_blob
                 FROM knowledge_embeddings e
                 INNER JOIN knowledge_ai_chunks c ON c.id = e.chunk_id
                 LEFT JOIN knowledge_search_fts f
                   ON f.source_type = c.source_type AND f.source_id = c.source_id
                 LEFT JOIN knowledge_nodes n ON n.id = f.node_id
                 LEFT JOIN knowledge_assets a ON a.id = f.asset_id
                 WHERE e.provider = ?1
                   AND e.model = ?2
                   AND (?3 IS NULL OR f.library_id = ?3 OR n.library_id = ?3 OR a.library_id = ?3)
                   AND (?4 IS NULL OR n.space_id = ?4)
                   AND (?5 IS NULL OR c.source_type = ?5)
                   AND (n.deleted_at IS NULL OR n.id IS NULL)
                   AND (n.is_archived = 0 OR n.id IS NULL)
                 ORDER BY e.created_at DESC
                 LIMIT ?6",
            )?;
            let rows = stmt
                .query_map(
                    params![provider, model, library_id, space_id, source_type, limit],
                    Self::map_embedding_candidate,
                )?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn embedding_stats(
        db: &Database,
        provider: &str,
        model: &str,
    ) -> DbResult<KnowledgeEmbeddingStats> {
        db.with_connection(|conn| {
            let chunk_count =
                conn.query_row("SELECT COUNT(*) FROM knowledge_ai_chunks", [], |row| {
                    row.get::<_, i64>(0)
                })?;
            let embedded_count = conn.query_row(
                "SELECT COUNT(DISTINCT chunk_id)
                 FROM knowledge_embeddings
                 WHERE provider = ?1 AND model = ?2",
                params![provider, model],
                |row| row.get::<_, i64>(0),
            )?;
            Ok(KnowledgeEmbeddingStats {
                chunk_count,
                embedded_count,
                provider: provider.to_string(),
                model: model.to_string(),
            })
        })
    }

    pub fn list_tags(
        db: &Database,
        input: Option<ListKnowledgeTagsInput>,
    ) -> DbResult<Vec<KnowledgeTag>> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let input = input.unwrap_or(ListKnowledgeTagsInput {
                library_id: None,
                target_type: None,
                target_id: None,
            });
            let library_id = Self::resolve_library_id(conn, input.library_id)?;
            let target_type = Self::normalize_optional_text(input.target_type);
            let target_id = Self::normalize_optional_text(input.target_id);

            let mut stmt = conn.prepare(
                "SELECT DISTINCT t.id, t.library_id, t.name, t.color, t.created_at
                 FROM knowledge_tags t
                 LEFT JOIN knowledge_tag_bindings b ON b.tag_id = t.id
                 WHERE t.library_id = ?1
                   AND (?2 IS NULL OR (b.target_type = ?2 AND b.target_id = ?3))
                 ORDER BY lower(t.name) ASC",
            )?;
            let tags = stmt
                .query_map(params![library_id, target_type, target_id], Self::map_tag)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(tags)
        })
    }

    pub fn create_tag(db: &Database, input: CreateKnowledgeTagInput) -> DbResult<KnowledgeTag> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let library_id = Self::resolve_library_id(conn, input.library_id)?;
            let name = Self::normalize_tag_name(input.name)?;
            let color = Self::normalize_tag_color(input.color);
            let id = Self::new_id("tag");
            conn.execute(
                "INSERT OR IGNORE INTO knowledge_tags (id, library_id, name, color)
                 VALUES (?1, ?2, ?3, ?4)",
                params![id, library_id, name, color],
            )?;
            Self::get_tag_by_name(conn, &library_id, &name)
        })
    }

    pub fn update_tag(
        db: &Database,
        tag_id: &str,
        input: UpdateKnowledgeTagInput,
    ) -> DbResult<KnowledgeTag> {
        db.transaction(|conn| {
            let current = Self::get_tag(conn, tag_id)?;
            let name = match input.name {
                Some(name) => Self::normalize_tag_name(name)?,
                None => current.name,
            };
            let color = match input.color {
                Some(color) => Self::normalize_tag_color(Some(color)),
                None => current.color,
            };
            conn.execute(
                "UPDATE knowledge_tags SET name = ?1, color = ?2 WHERE id = ?3",
                params![name, color, tag_id],
            )?;
            Self::get_tag(conn, tag_id)
        })
    }

    pub fn bind_tag(db: &Database, input: BindKnowledgeTagInput) -> DbResult<KnowledgeTag> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let target_type = Self::normalize_tag_target_type(input.target_type)?;
            let target_id = Self::normalize_required_text(input.target_id, "标签目标 ID 不能为空")?;
            let tag = if let Some(tag_id) = Self::normalize_optional_text(input.tag_id) {
                Self::get_tag(conn, &tag_id)?
            } else {
                let name = Self::normalize_tag_name(input.name.unwrap_or_default())?;
                let library_id = Self::resolve_target_library_id(conn, &target_type, &target_id)?;
                let color = Self::normalize_tag_color(input.color);
                conn.execute(
                    "INSERT OR IGNORE INTO knowledge_tags (id, library_id, name, color)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![Self::new_id("tag"), library_id, name, color],
                )?;
                Self::get_tag_by_name(conn, &library_id, &name)?
            };
            conn.execute(
                "INSERT OR IGNORE INTO knowledge_tag_bindings (id, tag_id, target_type, target_id)
                 VALUES (?1, ?2, ?3, ?4)",
                params![Self::new_id("tag-binding"), tag.id, target_type, target_id],
            )?;
            Ok(tag)
        })
    }

    pub fn unbind_tag(db: &Database, input: UnbindKnowledgeTagInput) -> DbResult<()> {
        db.transaction(|conn| {
            let target_type = Self::normalize_tag_target_type(input.target_type)?;
            let target_id = Self::normalize_required_text(input.target_id, "标签目标 ID 不能为空")?;
            conn.execute(
                "DELETE FROM knowledge_tag_bindings
                 WHERE tag_id = ?1 AND target_type = ?2 AND target_id = ?3",
                params![input.tag_id, target_type, target_id],
            )?;
            Ok(())
        })
    }

    pub fn list_tag_targets(
        db: &Database,
        input: ListKnowledgeTagTargetsInput,
    ) -> DbResult<Vec<KnowledgeTaggedTarget>> {
        db.transaction(|conn| {
            let tag = Self::get_tag(conn, &input.tag_id)?;
            let target_type = match input.target_type {
                Some(value) => Some(Self::normalize_tag_target_type(value)?),
                None => None,
            };
            let limit = input.limit.unwrap_or(50).clamp(1, 200);
            let mut stmt = conn.prepare(
                "SELECT b.target_type, b.target_id,
                        COALESCE(n.title, a.original_name, q.title, td.title, b.target_id) AS title,
                        CASE
                          WHEN b.target_type IN ('page', 'quick_note') THEN b.target_id
                          ELSE NULL
                        END AS node_id,
                        CASE WHEN b.target_type = 'asset' THEN b.target_id ELSE NULL END AS asset_id,
                        COALESCE(n.updated_at, a.updated_at, q.updated_at, td.updated_at, b.created_at) AS updated_at
                 FROM knowledge_tag_bindings b
                 LEFT JOIN knowledge_nodes n ON n.id = b.target_id AND b.target_type IN ('page', 'quick_note')
                 LEFT JOIN knowledge_assets a ON a.id = b.target_id AND b.target_type = 'asset'
                 LEFT JOIN knowledge_quick_notes q ON q.id = b.target_id AND b.target_type = 'quick_note'
                 LEFT JOIN todos td ON td.id = b.target_id AND b.target_type = 'todo'
                 WHERE b.tag_id = ?1
                   AND (?2 IS NULL OR b.target_type = ?2)
                   AND (n.deleted_at IS NULL OR n.id IS NULL)
                   AND (n.is_archived = 0 OR n.id IS NULL)
                 ORDER BY updated_at DESC
                 LIMIT ?3",
            )?;
            let targets = stmt
                .query_map(params![tag.id, target_type, limit], |row| {
                    Ok(KnowledgeTaggedTarget {
                        target_type: row.get(0)?,
                        target_id: row.get(1)?,
                        title: row.get(2)?,
                        node_id: row.get(3)?,
                        asset_id: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(targets)
        })
    }

    pub fn list_page_links(db: &Database, page_id: &str) -> DbResult<Vec<KnowledgeLink>> {
        db.transaction(|conn| {
            let page = Self::get_page_detail(conn, page_id)?;
            Self::sync_page_wikilinks(conn, &page)?;
            let mut stmt = conn.prepare(
                "SELECT id, source_type, source_id, target_type, target_id, target_url, link_type, created_at
                 FROM knowledge_links
                 WHERE source_type = 'page' AND source_id = ?1
                 ORDER BY created_at DESC",
            )?;
            let links = stmt
                .query_map(params![page_id], Self::map_link)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(links)
        })
    }

    pub fn list_backlinks(db: &Database, page_id: &str) -> DbResult<Vec<KnowledgeBacklink>> {
        db.transaction(|conn| {
            Self::get_page_detail(conn, page_id)?;
            let mut stmt = conn.prepare(
                "SELECT l.id, l.source_type, l.source_id,
                        COALESCE(n.title, q.title, td.title, l.source_id) AS source_title,
                        CASE
                          WHEN l.source_type IN ('page', 'document', 'quick_note') THEN l.source_id
                          ELSE NULL
                        END AS source_node_id,
                        l.link_type, l.created_at
                 FROM knowledge_links l
                 LEFT JOIN knowledge_nodes n ON n.id = l.source_id AND l.source_type IN ('page', 'document', 'quick_note')
                 LEFT JOIN knowledge_quick_notes q ON q.id = l.source_id AND l.source_type = 'quick_note'
                 LEFT JOIN todos td ON td.id = l.source_id AND l.source_type = 'todo'
                 WHERE l.target_type = 'page'
                   AND l.target_id = ?1
                   AND (n.deleted_at IS NULL OR n.id IS NULL)
                   AND (n.is_archived = 0 OR n.id IS NULL)
                 ORDER BY l.created_at DESC",
            )?;
            let backlinks = stmt
                .query_map(params![page_id], |row| {
                    Ok(KnowledgeBacklink {
                        id: row.get(0)?,
                        source_type: row.get(1)?,
                        source_id: row.get(2)?,
                        source_title: row.get(3)?,
                        source_node_id: row.get(4)?,
                        link_type: row.get(5)?,
                        created_at: row.get(6)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(backlinks)
        })
    }

    pub fn link_todo_source(db: &Database, input: LinkKnowledgeTodoInput) -> DbResult<()> {
        db.transaction(|conn| {
            Self::get_page_detail(conn, &input.page_id)?;
            Self::insert_knowledge_link(
                conn,
                "page",
                &input.page_id,
                "todo",
                Some(&input.todo_id),
                "todo",
            )?;
            Self::insert_knowledge_link(
                conn,
                "todo",
                &input.todo_id,
                "page",
                Some(&input.page_id),
                "source",
            )?;
            Ok(())
        })
    }

    pub fn get_graph(db: &Database, input: KnowledgeGraphInput) -> DbResult<KnowledgeGraph> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let library_id = Self::resolve_library_id(conn, input.library_id)?;
            let space_id = Self::normalize_optional_text(input.space_id);
            let tag_id = Self::normalize_optional_text(input.tag_id);
            let limit = input.limit.unwrap_or(200).clamp(1, 200);
            let mut nodes: Vec<KnowledgeGraphNode> = Vec::new();
            let mut node_keys: HashSet<String> = HashSet::new();
            let mut page_ids: HashSet<String> = HashSet::new();
            let mut asset_ids: HashSet<String> = HashSet::new();
            let mut todo_ids: HashSet<String> = HashSet::new();

            let mut page_stmt = conn.prepare(
                "SELECT n.id, n.node_type, n.title, n.space_id, p.source_asset_id
                 FROM knowledge_nodes n
                 INNER JOIN knowledge_pages p ON p.id = n.id
                 WHERE n.library_id = ?1
                   AND n.deleted_at IS NULL
                   AND n.is_archived = 0
                   AND n.node_type IN ('page', 'document')
                   AND (?2 IS NULL OR n.space_id = ?2)
                   AND (?3 IS NULL OR EXISTS (
                     SELECT 1 FROM knowledge_tag_bindings b
                     WHERE b.tag_id = ?3 AND b.target_type = 'page' AND b.target_id = n.id
                   ))
                 ORDER BY n.updated_at DESC
                 LIMIT ?4",
            )?;
            let page_rows = page_stmt
                .query_map(params![library_id, space_id, tag_id, limit], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;

            for (id, node_type, title, row_space_id, source_asset_id) in page_rows {
                let graph_id = format!("page:{id}");
                if node_keys.insert(graph_id.clone()) {
                    page_ids.insert(id.clone());
                    if let Some(asset_id) = source_asset_id {
                        asset_ids.insert(asset_id);
                    }
                    nodes.push(KnowledgeGraphNode {
                        id: graph_id,
                        target_type: node_type.clone(),
                        target_id: id,
                        title,
                        subtitle: row_space_id,
                        color: None,
                        group: if node_type == "document" {
                            "document"
                        } else {
                            "page"
                        }
                        .to_string(),
                    });
                }
            }

            let linked_todos = Self::linked_todo_ids(conn, &page_ids)?;
            todo_ids.extend(linked_todos);
            let tagged_assets = if let Some(ref tag_id) = tag_id {
                Self::tagged_target_ids(conn, tag_id, "asset")?
            } else {
                HashSet::new()
            };
            asset_ids.extend(tagged_assets);

            for asset in Self::graph_assets(conn, &asset_ids, limit)? {
                let graph_id = format!("asset:{}", asset.id);
                if node_keys.insert(graph_id.clone()) {
                    nodes.push(KnowledgeGraphNode {
                        id: graph_id,
                        target_type: "asset".to_string(),
                        target_id: asset.id,
                        title: asset.original_name,
                        subtitle: Some(asset.mime_type),
                        color: None,
                        group: "asset".to_string(),
                    });
                }
            }

            for (todo_id, title, is_completed) in Self::graph_todos(conn, &todo_ids, limit)? {
                let graph_id = format!("todo:{todo_id}");
                if node_keys.insert(graph_id.clone()) {
                    nodes.push(KnowledgeGraphNode {
                        id: graph_id,
                        target_type: "todo".to_string(),
                        target_id: todo_id,
                        title,
                        subtitle: Some(
                            if is_completed {
                                "已完成"
                            } else {
                                "未完成"
                            }
                            .to_string(),
                        ),
                        color: None,
                        group: "todo".to_string(),
                    });
                }
            }

            let mut edges = Self::graph_edges(conn, &node_keys, limit)?;
            edges.extend(Self::document_asset_edges(conn, &page_ids, &node_keys)?);
            edges.truncate(limit as usize);
            let truncated = nodes.len() >= limit as usize || edges.len() >= limit as usize;
            nodes.truncate(limit as usize);

            Ok(KnowledgeGraph {
                nodes,
                edges,
                truncated,
            })
        })
    }

    pub fn list_orphan_pages(
        db: &Database,
        input: Option<ListKnowledgeOrphanPagesInput>,
    ) -> DbResult<Vec<KnowledgeNode>> {
        db.transaction(|conn| {
            Self::ensure_default_structure_with_conn(conn)?;
            let input = input.unwrap_or(ListKnowledgeOrphanPagesInput {
                library_id: None,
                space_id: None,
                limit: None,
            });
            let library_id = Self::resolve_library_id(conn, input.library_id)?;
            let space_id = Self::normalize_optional_text(input.space_id);
            let limit = input.limit.unwrap_or(50).clamp(1, 200);
            let mut stmt = conn.prepare(
                "SELECT n.id, n.library_id, n.space_id, n.parent_id, n.node_type, n.title, n.icon,
                        n.sort_order, n.is_archived, n.is_favorite, n.created_at, n.updated_at, n.deleted_at
                 FROM knowledge_nodes n
                 WHERE n.library_id = ?1
                   AND (?2 IS NULL OR n.space_id = ?2)
                   AND n.node_type = 'page'
                   AND n.deleted_at IS NULL
                   AND n.is_archived = 0
                   AND NOT EXISTS (
                     SELECT 1 FROM knowledge_links l
                     WHERE (l.source_type = 'page' AND l.source_id = n.id)
                        OR (l.target_type = 'page' AND l.target_id = n.id)
                   )
                   AND NOT EXISTS (
                     SELECT 1 FROM knowledge_tag_bindings b
                     WHERE b.target_type = 'page' AND b.target_id = n.id
                   )
                 ORDER BY n.updated_at DESC
                 LIMIT ?3",
            )?;
            let pages = stmt
                .query_map(params![library_id, space_id, limit], Self::map_node)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(pages)
        })
    }

    pub fn update_page(
        db: &Database,
        page_id: &str,
        input: UpdateKnowledgePageInput,
    ) -> DbResult<KnowledgePageDetail> {
        db.transaction(|conn| {
            let current = Self::get_page_detail(conn, page_id)?;
            let title = input.title.unwrap_or(current.node.title);
            let sort_order = input.sort_order.unwrap_or(current.node.sort_order);
            let content_markdown = input
                .content_markdown
                .unwrap_or(current.page.content_markdown);
            let content_json = input.content_json.or(current.page.content_json);
            let content_text = input
                .content_text
                .unwrap_or_else(|| content_markdown.clone());
            let properties_json = input.properties_json.or(current.page.properties_json);

            conn.execute(
                "UPDATE knowledge_nodes
                 SET title = ?1, sort_order = ?2, updated_at = datetime('now')
                 WHERE id = ?3 AND node_type = 'page'",
                params![title, sort_order, page_id],
            )?;
            conn.execute(
                "UPDATE knowledge_pages
                 SET content_markdown = ?1, content_json = ?2, content_text = ?3,
                     properties_json = ?4, updated_at = datetime('now')
                 WHERE id = ?5",
                params![
                    content_markdown,
                    content_json,
                    content_text,
                    properties_json,
                    page_id
                ],
            )?;
            let detail = Self::get_page_detail(conn, page_id)?;
            Self::upsert_search_document(
                conn,
                &detail.node.library_id,
                if detail.node.node_type == "document" {
                    "document"
                } else {
                    "page"
                },
                &detail.node.id,
                Some(&detail.node.id),
                detail.page.source_asset_id.as_deref(),
                &detail.node.title,
                &detail.page.content_text,
                "",
                detail.page.properties_json.as_deref().unwrap_or(""),
            )?;
            Self::sync_page_wikilinks(conn, &detail)?;
            Ok(detail)
        })
    }

    pub fn move_node(
        db: &Database,
        node_id: &str,
        input: MoveKnowledgeNodeInput,
    ) -> DbResult<KnowledgeNode> {
        db.transaction(|conn| {
            let node = Self::get_node(conn, node_id)?;
            if node.id == Self::DEFAULT_INBOX_NODE_ID {
                return Err(DbError::InvalidParameter("快速收集箱不能移动".to_string()));
            }
            let parent_id = Self::normalize_optional_text(input.parent_id);
            let (library_id, space_id) = if let Some(ref parent_id) = parent_id {
                if parent_id == node_id {
                    return Err(DbError::InvalidParameter("不能把节点移动到自身下".to_string()));
                }
                Self::ensure_not_descendant(conn, node_id, parent_id)?;
                let parent = Self::get_node(conn, parent_id)?;
                if parent.node_type != "folder" {
                    return Err(DbError::InvalidParameter("目标父节点必须是文件夹".to_string()));
                }
                (parent.library_id, parent.space_id)
            } else {
                (node.library_id, node.space_id)
            };
            let sort_order = input.sort_order.unwrap_or(node.sort_order);

            conn.execute(
                "UPDATE knowledge_nodes
                 SET library_id = ?1, space_id = ?2, parent_id = ?3, sort_order = ?4, updated_at = datetime('now')
                 WHERE id = ?5",
                params![library_id, space_id, parent_id, sort_order, node_id],
            )?;
            Self::get_node(conn, node_id)
        })
    }

    pub fn update_node(
        db: &Database,
        node_id: &str,
        input: UpdateKnowledgeNodeInput,
    ) -> DbResult<KnowledgeNode> {
        db.transaction(|conn| {
            let current = Self::get_node(conn, node_id)?;
            if current.deleted_at.is_some() {
                return Err(DbError::InvalidParameter("已删除节点不能更新".to_string()));
            }

            let title = match input.title {
                Some(title) => Self::normalize_required_text(title, "节点标题不能为空")?,
                None => current.title,
            };
            let icon = input.icon.or(current.icon);
            let sort_order = input.sort_order.unwrap_or(current.sort_order);

            conn.execute(
                "UPDATE knowledge_nodes
                 SET title = ?1, icon = ?2, sort_order = ?3, updated_at = datetime('now')
                 WHERE id = ?4",
                params![title, icon, sort_order, node_id],
            )?;
            Self::get_node(conn, node_id)
        })
    }

    pub fn archive_node(db: &Database, node_id: &str) -> DbResult<KnowledgeNode> {
        db.transaction(|conn| {
            let node = Self::get_node(conn, node_id)?;
            if node.id == Self::DEFAULT_INBOX_NODE_ID {
                return Err(DbError::InvalidParameter("快速收集箱不能归档".to_string()));
            }
            conn.execute(
                "UPDATE knowledge_nodes
                 SET is_archived = 1, updated_at = datetime('now')
                 WHERE id = ?1",
                params![node_id],
            )?;
            conn.execute(
                "DELETE FROM knowledge_search_fts WHERE node_id = ?1",
                params![node_id],
            )?;
            Self::get_node(conn, node_id)
        })
    }

    pub fn delete_node(db: &Database, node_id: &str) -> DbResult<()> {
        db.transaction(|conn| {
            let node = Self::get_node(conn, node_id)?;
            if node.id == Self::DEFAULT_INBOX_NODE_ID {
                return Err(DbError::InvalidParameter("快速收集箱不能删除".to_string()));
            }

            conn.execute(
                "WITH RECURSIVE subtree(id) AS (
                    SELECT id FROM knowledge_nodes WHERE id = ?1
                    UNION ALL
                    SELECT child.id
                    FROM knowledge_nodes child
                    INNER JOIN subtree ON child.parent_id = subtree.id
                  )
                  UPDATE knowledge_nodes
                  SET is_archived = 1, deleted_at = datetime('now'), updated_at = datetime('now')
                  WHERE id IN (SELECT id FROM subtree)",
                params![node_id],
            )?;
            conn.execute(
                "DELETE FROM knowledge_search_fts
                 WHERE node_id IN (
                    WITH RECURSIVE subtree(id) AS (
                      SELECT id FROM knowledge_nodes WHERE id = ?1
                      UNION ALL
                      SELECT child.id
                      FROM knowledge_nodes child
                      INNER JOIN subtree ON child.parent_id = subtree.id
                    )
                    SELECT id FROM subtree
                 )",
                params![node_id],
            )?;
            Ok(())
        })
    }

    pub fn toggle_favorite(
        db: &Database,
        node_id: &str,
        favorite: bool,
    ) -> DbResult<KnowledgeNode> {
        db.transaction(|conn| {
            Self::get_node(conn, node_id)?;
            conn.execute(
                "UPDATE knowledge_nodes
                 SET is_favorite = ?1, updated_at = datetime('now')
                 WHERE id = ?2",
                params![favorite as i64, node_id],
            )?;
            Self::get_node(conn, node_id)
        })
    }

    fn ensure_default_structure_with_conn(conn: &Connection) -> DbResult<()> {
        let library_id: Option<String> = conn
            .query_row(
                "SELECT id FROM knowledge_libraries WHERE is_default = 1 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .optional()?;

        let library_id = match library_id {
            Some(id) => id,
            None => {
                conn.execute(
                    "INSERT INTO knowledge_libraries (id, name, description, is_default)
                     VALUES (?1, '默认知识库', 'GuYanTools 默认本地知识库', 1)",
                    params![Self::DEFAULT_LIBRARY_ID],
                )?;
                Self::DEFAULT_LIBRARY_ID.to_string()
            }
        };

        let space_id = Self::ensure_default_space_with_conn(conn, &library_id)?;
        let inbox_exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM knowledge_nodes WHERE id = ?1)",
            params![Self::DEFAULT_INBOX_NODE_ID],
            |row| row.get(0),
        )?;
        if !inbox_exists {
            conn.execute(
                "INSERT INTO knowledge_nodes (id, library_id, space_id, parent_id, node_type, title, icon, sort_order)
                 VALUES (?1, ?2, ?3, NULL, 'folder', '快速收集箱', 'inbox', -100)",
                params![Self::DEFAULT_INBOX_NODE_ID, library_id, space_id],
            )?;
        }

        Ok(())
    }

    fn ensure_default_space_with_conn(conn: &Connection, library_id: &str) -> DbResult<String> {
        let space_id: Option<String> = conn
            .query_row(
                "SELECT id FROM knowledge_spaces WHERE library_id = ?1 AND is_default = 1 LIMIT 1",
                params![library_id],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(space_id) = space_id {
            return Ok(space_id);
        }

        let id = if library_id == Self::DEFAULT_LIBRARY_ID {
            Self::DEFAULT_SPACE_ID.to_string()
        } else {
            Self::new_id("space")
        };
        conn.execute(
            "INSERT INTO knowledge_spaces (id, library_id, name, description, icon, color, sort_order, is_default)
             VALUES (?1, ?2, '默认空间', '默认资料空间', 'library', '#4A90D9', 0, 1)",
            params![id, library_id],
        )?;
        Ok(id)
    }

    fn resolve_library_id(conn: &Connection, library_id: Option<String>) -> DbResult<String> {
        if let Some(library_id) = Self::normalize_optional_text(library_id) {
            Self::get_library(conn, &library_id)?;
            return Ok(library_id);
        }

        Self::ensure_default_structure_with_conn(conn)?;
        conn.query_row(
            "SELECT id FROM knowledge_libraries WHERE is_default = 1 LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    fn resolve_space_id(
        conn: &Connection,
        library_id: &str,
        space_id: Option<String>,
    ) -> DbResult<String> {
        if let Some(space_id) = Self::normalize_optional_text(space_id) {
            let space = Self::get_space(conn, &space_id)?;
            if space.library_id != library_id {
                return Err(DbError::InvalidParameter(format!(
                    "空间 {} 不属于知识库 {}",
                    space_id, library_id
                )));
            }
            return Ok(space_id);
        }

        Self::ensure_default_space_with_conn(conn, library_id)
    }

    fn resolve_node_scope(
        conn: &Connection,
        library_id: Option<String>,
        space_id: Option<String>,
        parent_id: Option<&str>,
    ) -> DbResult<(String, Option<String>)> {
        if let Some(parent_id) = parent_id {
            let parent = Self::get_node(conn, parent_id)?;
            if parent.node_type != "folder" {
                return Err(DbError::InvalidParameter("父节点必须是文件夹".to_string()));
            }
            return Ok((parent.library_id, parent.space_id));
        }

        let library_id = Self::resolve_library_id(conn, library_id)?;
        let space_id = Self::resolve_space_id(conn, &library_id, space_id)?;
        Ok((library_id, Some(space_id)))
    }

    fn upsert_sync_library(
        conn: &Connection,
        payload: KnowledgeSyncLibraryPayload,
    ) -> DbResult<KnowledgeLibrary> {
        let id = Self::normalize_required_text(payload.id, "同步知识库 ID 不能为空")?;
        let name = Self::normalize_required_text(payload.name, "知识库名称不能为空")?;
        let description = Self::normalize_optional_text(payload.description).unwrap_or_default();
        let is_default = payload.is_default.unwrap_or(false);
        if is_default {
            conn.execute(
                "UPDATE knowledge_libraries SET is_default = 0 WHERE id <> ?1",
                params![id],
            )?;
        }
        conn.execute(
            "INSERT INTO knowledge_libraries (
                id, name, description, is_default, created_at, updated_at
             )
             VALUES (
                ?1, ?2, ?3, ?4,
                COALESCE(?5, datetime('now')),
                COALESCE(?6, datetime('now'))
             )
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                is_default = excluded.is_default,
                updated_at = excluded.updated_at",
            params![
                id,
                name,
                description,
                is_default as i64,
                payload.created_at,
                payload.updated_at
            ],
        )?;
        Self::get_library(conn, &id)
    }

    fn upsert_sync_space(
        conn: &Connection,
        payload: KnowledgeSyncSpacePayload,
    ) -> DbResult<KnowledgeSpace> {
        let id = Self::normalize_required_text(payload.id, "同步空间 ID 不能为空")?;
        let library_id =
            Self::normalize_required_text(payload.library_id, "同步空间知识库 ID 不能为空")?;
        Self::get_library(conn, &library_id)?;
        let name = Self::normalize_required_text(payload.name, "空间名称不能为空")?;
        let description = Self::normalize_optional_text(payload.description).unwrap_or_default();
        let icon = Self::normalize_optional_text(payload.icon).unwrap_or_else(|| "library".to_string());
        let color = Self::normalize_optional_text(payload.color).unwrap_or_else(|| "#4A90D9".to_string());
        let sort_order = payload.sort_order.unwrap_or(0);
        let is_default = payload.is_default.unwrap_or(false);
        if is_default {
            conn.execute(
                "UPDATE knowledge_spaces SET is_default = 0 WHERE library_id = ?1 AND id <> ?2",
                params![library_id, id],
            )?;
        }
        conn.execute(
            "INSERT INTO knowledge_spaces (
                id, library_id, name, description, icon, color, sort_order, is_default,
                created_at, updated_at
             )
             VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                COALESCE(?9, datetime('now')),
                COALESCE(?10, datetime('now'))
             )
             ON CONFLICT(id) DO UPDATE SET
                library_id = excluded.library_id,
                name = excluded.name,
                description = excluded.description,
                icon = excluded.icon,
                color = excluded.color,
                sort_order = excluded.sort_order,
                is_default = excluded.is_default,
                updated_at = excluded.updated_at",
            params![
                id,
                library_id,
                name,
                description,
                icon,
                color,
                sort_order,
                is_default as i64,
                payload.created_at,
                payload.updated_at
            ],
        )?;
        Self::get_space(conn, &id)
    }

    fn upsert_sync_node(
        conn: &Connection,
        payload: KnowledgeSyncNodePayload,
        fallback_node_type: &str,
    ) -> DbResult<KnowledgeNode> {
        let id = Self::normalize_required_text(payload.id, "同步节点 ID 不能为空")?;
        let library_id =
            Self::normalize_required_text(payload.library_id, "同步节点知识库 ID 不能为空")?;
        Self::get_library(conn, &library_id)?;
        let space_id = Self::existing_space_id(conn, payload.space_id)?;
        let parent_id = Self::existing_parent_id(conn, &id, payload.parent_id)?;
        let node_type = Self::normalize_sync_node_type(payload.node_type, fallback_node_type)?;
        let title = Self::normalize_required_text(payload.title, "节点标题不能为空")?;
        let sort_order = payload.sort_order.unwrap_or(0);
        conn.execute(
            "INSERT INTO knowledge_nodes (
                id, library_id, space_id, parent_id, node_type, title, icon, sort_order,
                is_archived, is_favorite, created_at, updated_at, deleted_at
             )
             VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                COALESCE(?11, datetime('now')),
                COALESCE(?12, datetime('now')),
                ?13
             )
             ON CONFLICT(id) DO UPDATE SET
                library_id = excluded.library_id,
                space_id = excluded.space_id,
                parent_id = excluded.parent_id,
                node_type = excluded.node_type,
                title = excluded.title,
                icon = excluded.icon,
                sort_order = excluded.sort_order,
                is_archived = excluded.is_archived,
                is_favorite = excluded.is_favorite,
                updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at",
            params![
                id,
                library_id,
                space_id,
                parent_id,
                node_type,
                title,
                payload.icon,
                sort_order,
                payload.is_archived.unwrap_or(false) as i64,
                payload.is_favorite.unwrap_or(false) as i64,
                payload.created_at,
                payload.updated_at,
                payload.deleted_at
            ],
        )?;
        Self::get_node(conn, &id)
    }

    fn upsert_sync_page(
        conn: &Connection,
        payload: KnowledgeSyncPageObjectPayload,
    ) -> DbResult<KnowledgePageDetail> {
        let node_type = payload.node.node_type.as_deref().unwrap_or("page").to_string();
        let fallback = if node_type == "document" { "document" } else { "page" };
        let node = Self::upsert_sync_node(conn, payload.node, fallback)?;
        let page_type = Self::normalize_page_type(payload.page.page_type)?;
        let content_markdown = payload.page.content_markdown.unwrap_or_default();
        let content_text = payload
            .page
            .content_text
            .unwrap_or_else(|| content_markdown.clone());
        conn.execute(
            "INSERT INTO knowledge_pages (
                id, page_type, content_markdown, content_json, content_text, properties_json,
                source_asset_id, created_at, updated_at
             )
             VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                COALESCE(?8, datetime('now')),
                COALESCE(?9, datetime('now'))
             )
             ON CONFLICT(id) DO UPDATE SET
                page_type = excluded.page_type,
                content_markdown = excluded.content_markdown,
                content_json = excluded.content_json,
                content_text = excluded.content_text,
                properties_json = excluded.properties_json,
                source_asset_id = excluded.source_asset_id,
                updated_at = excluded.updated_at",
            params![
                payload.page.id,
                page_type,
                content_markdown,
                payload.page.content_json,
                content_text,
                payload.page.properties_json,
                payload.page.source_asset_id,
                payload.page.created_at,
                payload.page.updated_at
            ],
        )?;
        let detail = Self::get_page_detail(conn, &node.id)?;
        Self::upsert_search_document(
            conn,
            &detail.node.library_id,
            &detail.node.node_type,
            &detail.node.id,
            Some(&detail.node.id),
            detail.page.source_asset_id.as_deref(),
            &detail.node.title,
            &detail.page.content_text,
            "",
            detail.page.properties_json.as_deref().unwrap_or(""),
        )?;
        Self::sync_page_wikilinks(conn, &detail)?;
        Ok(detail)
    }

    fn upsert_sync_asset(
        conn: &Connection,
        payload: KnowledgeSyncAssetPayload,
    ) -> DbResult<KnowledgeAsset> {
        let id = Self::normalize_required_text(payload.id, "同步资产 ID 不能为空")?;
        let library_id =
            Self::normalize_required_text(payload.library_id, "同步资产知识库 ID 不能为空")?;
        Self::get_library(conn, &library_id)?;
        let hash = Self::normalize_required_text(payload.hash, "同步资产哈希不能为空")?;
        let original_name = Self::normalize_required_text(payload.original_name, "资产名称不能为空")?;
        let mime_type = Self::normalize_optional_text(payload.mime_type).unwrap_or_default();
        let extension = Self::normalize_optional_text(payload.extension).unwrap_or_default();
        let extracted_text = Self::normalize_optional_text(payload.extracted_text).unwrap_or_default();
        let import_status = Self::normalize_import_status(payload.import_status)?;
        let storage_path = Self::normalize_optional_text(payload.storage_path)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| format!("sync-pending://{}", hash));
        conn.execute(
            "INSERT INTO knowledge_assets (
                id, library_id, hash, original_name, mime_type, extension, size_bytes,
                storage_path, original_path, preview_path, thumbnail_path, extracted_text,
                metadata_json, import_status, created_at, updated_at
             )
             VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                ?8, NULL, NULL, NULL, ?9, ?10, ?11,
                COALESCE(?12, datetime('now')),
                COALESCE(?13, datetime('now'))
             )
             ON CONFLICT(id) DO UPDATE SET
                library_id = excluded.library_id,
                hash = excluded.hash,
                original_name = excluded.original_name,
                mime_type = excluded.mime_type,
                extension = excluded.extension,
                size_bytes = excluded.size_bytes,
                extracted_text = excluded.extracted_text,
                metadata_json = excluded.metadata_json,
                import_status = excluded.import_status,
                updated_at = excluded.updated_at",
            params![
                id,
                library_id,
                hash,
                original_name,
                mime_type,
                extension,
                payload.size_bytes.unwrap_or(0),
                storage_path,
                extracted_text,
                payload.metadata_json,
                import_status,
                payload.created_at,
                payload.updated_at
            ],
        )?;
        let asset = Self::get_asset(conn, &id)?;
        Self::upsert_search_document(
            conn,
            &asset.library_id,
            "asset",
            &asset.id,
            None,
            Some(&asset.id),
            &asset.original_name,
            &asset.extracted_text,
            "",
            asset.metadata_json.as_deref().unwrap_or(""),
        )?;
        Ok(asset)
    }

    fn upsert_sync_tag(conn: &Connection, payload: KnowledgeSyncTagPayload) -> DbResult<KnowledgeTag> {
        let id = Self::normalize_required_text(payload.id, "同步标签 ID 不能为空")?;
        let library_id =
            Self::normalize_required_text(payload.library_id, "同步标签知识库 ID 不能为空")?;
        Self::get_library(conn, &library_id)?;
        let name = Self::normalize_tag_name(payload.name)?;
        let color = Self::normalize_tag_color(payload.color);
        let existing_same_name = conn
            .query_row(
                "SELECT id FROM knowledge_tags WHERE library_id = ?1 AND name = ?2",
                params![library_id, name],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if let Some(existing_id) = existing_same_name {
            conn.execute(
                "UPDATE knowledge_tags SET color = ?1 WHERE id = ?2",
                params![color, existing_id],
            )?;
            return Self::get_tag(conn, &existing_id);
        }
        conn.execute(
            "INSERT INTO knowledge_tags (id, library_id, name, color, created_at)
             VALUES (?1, ?2, ?3, ?4, COALESCE(?5, datetime('now')))
             ON CONFLICT(id) DO UPDATE SET
                library_id = excluded.library_id,
                name = excluded.name,
                color = excluded.color",
            params![id, library_id, name, color, payload.created_at],
        )?;
        Self::get_tag(conn, &id)
    }

    fn upsert_sync_link(conn: &Connection, payload: KnowledgeSyncLinkPayload) -> DbResult<()> {
        let id = Self::normalize_required_text(payload.id, "同步链接 ID 不能为空")?;
        let source_type = Self::normalize_required_text(payload.source_type, "链接来源类型不能为空")?;
        let source_id = Self::normalize_required_text(payload.source_id, "链接来源 ID 不能为空")?;
        let target_type = Self::normalize_required_text(payload.target_type, "链接目标类型不能为空")?;
        let target_id = Self::normalize_optional_text(payload.target_id);
        let target_url = Self::normalize_optional_text(payload.target_url);
        let link_type = Self::normalize_optional_text(payload.link_type).unwrap_or_else(|| "reference".to_string());
        conn.execute(
            "INSERT INTO knowledge_links (
                id, source_type, source_id, target_type, target_id, target_url, link_type, created_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE(?8, datetime('now')))
             ON CONFLICT(id) DO UPDATE SET
                source_type = excluded.source_type,
                source_id = excluded.source_id,
                target_type = excluded.target_type,
                target_id = excluded.target_id,
                target_url = excluded.target_url,
                link_type = excluded.link_type",
            params![id, source_type, source_id, target_type, target_id, target_url, link_type, payload.created_at],
        )?;
        Ok(())
    }

    fn existing_space_id(conn: &Connection, space_id: Option<String>) -> DbResult<Option<String>> {
        let Some(space_id) = Self::normalize_optional_text(space_id) else {
            return Ok(None);
        };
        let exists = conn
            .query_row(
                "SELECT 1 FROM knowledge_spaces WHERE id = ?1",
                params![space_id],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        Ok(exists.then_some(space_id))
    }

    fn existing_parent_id(
        conn: &Connection,
        node_id: &str,
        parent_id: Option<String>,
    ) -> DbResult<Option<String>> {
        let Some(parent_id) = Self::normalize_optional_text(parent_id) else {
            return Ok(None);
        };
        if parent_id == node_id {
            return Ok(None);
        }
        let exists = conn
            .query_row(
                "SELECT 1 FROM knowledge_nodes WHERE id = ?1 AND node_type = 'folder'",
                params![parent_id],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        Ok(exists.then_some(parent_id))
    }

    fn normalize_sync_node_type(value: Option<String>, fallback: &str) -> DbResult<String> {
        let node_type = Self::normalize_optional_text(value).unwrap_or_else(|| fallback.to_string());
        match node_type.as_str() {
            "folder" | "page" | "document" | "quick_note" => Ok(node_type),
            _ => Err(DbError::InvalidParameter(format!(
                "不支持的知识库节点类型: {}",
                node_type
            ))),
        }
    }

    fn get_library(conn: &Connection, library_id: &str) -> DbResult<KnowledgeLibrary> {
        conn.query_row(
            "SELECT id, name, description, is_default, created_at, updated_at
             FROM knowledge_libraries WHERE id = ?1",
            params![library_id],
            Self::map_library,
        )
        .map_err(Into::into)
    }

    fn get_space(conn: &Connection, space_id: &str) -> DbResult<KnowledgeSpace> {
        conn.query_row(
            "SELECT id, library_id, name, description, icon, color, sort_order, is_default, created_at, updated_at
             FROM knowledge_spaces WHERE id = ?1",
            params![space_id],
            Self::map_space,
        )
        .map_err(Into::into)
    }

    fn get_node(conn: &Connection, node_id: &str) -> DbResult<KnowledgeNode> {
        conn.query_row(
            "SELECT id, library_id, space_id, parent_id, node_type, title, icon, sort_order,
                    is_archived, is_favorite, created_at, updated_at, deleted_at
             FROM knowledge_nodes WHERE id = ?1",
            params![node_id],
            Self::map_node,
        )
        .map_err(Into::into)
    }

    fn get_page_record(conn: &Connection, page_id: &str) -> DbResult<KnowledgePage> {
        conn.query_row(
            "SELECT id, page_type, content_markdown, content_json, content_text, properties_json,
                    source_asset_id, created_at, updated_at
             FROM knowledge_pages WHERE id = ?1",
            params![page_id],
            Self::map_page,
        )
        .map_err(Into::into)
    }

    fn get_quick_note_record(conn: &Connection, note_id: &str) -> DbResult<KnowledgeQuickNote> {
        conn.query_row(
            "SELECT id, library_id, node_id, title, body, tags_json, color, is_pinned,
                    converted_page_id, converted_todo_id, created_at, updated_at
             FROM knowledge_quick_notes WHERE id = ?1",
            params![note_id],
            Self::map_quick_note,
        )
        .map_err(Into::into)
    }

    fn get_asset(conn: &Connection, asset_id: &str) -> DbResult<KnowledgeAsset> {
        conn.query_row(
            "SELECT id, library_id, hash, original_name, mime_type, extension, size_bytes,
                    storage_path, original_path, preview_path, thumbnail_path, extracted_text,
                    metadata_json, import_status, created_at, updated_at
             FROM knowledge_assets WHERE id = ?1",
            params![asset_id],
            Self::map_asset,
        )
        .map_err(Into::into)
    }

    fn get_page_detail(conn: &Connection, page_id: &str) -> DbResult<KnowledgePageDetail> {
        let node = Self::get_node(conn, page_id)?;
        if node.node_type != "page" && node.node_type != "document" {
            return Err(DbError::InvalidParameter(format!(
                "节点 {} 不是页面或文档",
                page_id
            )));
        }
        let page = Self::get_page_record(conn, page_id)?;
        Ok(KnowledgePageDetail { node, page })
    }

    fn get_quick_note_detail(
        conn: &Connection,
        note_id: &str,
    ) -> DbResult<KnowledgeQuickNoteDetail> {
        let node = Self::get_node(conn, note_id)?;
        if node.node_type != "quick_note" {
            return Err(DbError::InvalidParameter(format!(
                "节点 {} 不是速记",
                note_id
            )));
        }
        let quick_note = Self::get_quick_note_record(conn, note_id)?;
        Ok(KnowledgeQuickNoteDetail { node, quick_note })
    }

    fn ensure_not_descendant(conn: &Connection, node_id: &str, parent_id: &str) -> DbResult<()> {
        let mut current = Some(parent_id.to_string());
        while let Some(current_id) = current {
            if current_id == node_id {
                return Err(DbError::InvalidParameter(
                    "不能把节点移动到自己的子节点下".to_string(),
                ));
            }
            current = conn
                .query_row(
                    "SELECT parent_id FROM knowledge_nodes WHERE id = ?1",
                    params![current_id],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();
        }
        Ok(())
    }

    fn next_space_sort_order(conn: &Connection, library_id: &str) -> DbResult<i64> {
        conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM knowledge_spaces WHERE library_id = ?1",
            params![library_id],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    fn normalize_required_text(value: String, message: &str) -> DbResult<String> {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return Err(DbError::InvalidParameter(message.to_string()));
        }
        Ok(trimmed.to_string())
    }

    fn normalize_optional_text(value: Option<String>) -> Option<String> {
        value.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
    }

    fn normalize_page_type(value: Option<String>) -> DbResult<String> {
        let page_type =
            Self::normalize_optional_text(value).unwrap_or_else(|| "markdown".to_string());
        match page_type.as_str() {
            "markdown" | "block" | "canvas" | "external_document" => Ok(page_type),
            _ => Err(DbError::InvalidParameter(format!(
                "不支持的知识库页面类型: {}",
                page_type
            ))),
        }
    }

    fn is_markdown_import(extension: &str, mime_type: &str) -> bool {
        let extension = extension.trim().to_lowercase();
        let mime_type = mime_type.trim().to_lowercase();
        matches!(extension.as_str(), ".md" | ".markdown")
            || matches!(mime_type.as_str(), "text/markdown" | "text/x-markdown")
    }

    fn normalize_import_status(value: Option<String>) -> DbResult<String> {
        let status = Self::normalize_optional_text(value).unwrap_or_else(|| "ready".to_string());
        match status.as_str() {
            "pending" | "ready" | "failed" => Ok(status),
            _ => Err(DbError::InvalidParameter(format!(
                "不支持的知识库资产状态: {}",
                status
            ))),
        }
    }

    fn normalize_tags_json(value: Option<String>) -> DbResult<String> {
        let raw = Self::normalize_optional_text(value).unwrap_or_else(|| "[]".to_string());
        let parsed: serde_json::Value = serde_json::from_str(&raw)?;
        let Some(items) = parsed.as_array() else {
            return Err(DbError::InvalidParameter(
                "速记标签必须是 JSON 字符串数组".to_string(),
            ));
        };

        let mut tags: Vec<String> = Vec::new();
        for item in items {
            let Some(text) = item.as_str() else {
                continue;
            };
            let normalized = text.trim();
            if normalized.is_empty() || tags.iter().any(|tag| tag == normalized) {
                continue;
            }
            tags.push(normalized.chars().take(32).collect());
            if tags.len() >= 20 {
                break;
            }
        }
        serde_json::to_string(&tags).map_err(Into::into)
    }

    fn normalize_quick_note_color(value: Option<String>) -> DbResult<String> {
        let color = Self::normalize_optional_text(value).unwrap_or_else(|| "yellow".to_string());
        match color.as_str() {
            "yellow" | "blue" | "green" | "pink" | "purple" | "gray" => Ok(color),
            _ => Err(DbError::InvalidParameter(format!(
                "不支持的速记颜色: {}",
                color
            ))),
        }
    }

    fn normalize_tag_name(value: String) -> DbResult<String> {
        let name = Self::normalize_required_text(value, "标签名称不能为空")?;
        Ok(name.chars().take(32).collect())
    }

    fn normalize_tag_color(value: Option<String>) -> String {
        let color = Self::normalize_optional_text(value).unwrap_or_else(|| "#4A90D9".to_string());
        if color.len() <= 24 && color.starts_with('#') {
            color
        } else {
            "#4A90D9".to_string()
        }
    }

    fn normalize_tag_target_type(value: String) -> DbResult<String> {
        let target_type = Self::normalize_required_text(value, "标签目标类型不能为空")?;
        match target_type.as_str() {
            "page" | "asset" | "quick_note" | "todo" => Ok(target_type),
            _ => Err(DbError::InvalidParameter(format!(
                "不支持的标签目标类型: {}",
                target_type
            ))),
        }
    }

    fn resolve_target_library_id(
        conn: &Connection,
        target_type: &str,
        target_id: &str,
    ) -> DbResult<String> {
        match target_type {
            "page" | "quick_note" => conn
                .query_row(
                    "SELECT library_id FROM knowledge_nodes WHERE id = ?1 AND deleted_at IS NULL",
                    params![target_id],
                    |row| row.get(0),
                )
                .map_err(Into::into),
            "asset" => conn
                .query_row(
                    "SELECT library_id FROM knowledge_assets WHERE id = ?1",
                    params![target_id],
                    |row| row.get(0),
                )
                .map_err(Into::into),
            "todo" => Ok(Self::DEFAULT_LIBRARY_ID.to_string()),
            _ => Err(DbError::InvalidParameter(format!(
                "不支持的标签目标类型: {}",
                target_type
            ))),
        }
    }

    fn extract_wikilink_titles(text: &str) -> Vec<String> {
        let mut titles = Vec::new();
        let mut rest = text;
        while let Some(start) = rest.find("[[") {
            rest = &rest[start + 2..];
            let Some(end) = rest.find("]]") else {
                break;
            };
            let title = rest[..end].split('|').next().unwrap_or("").trim();
            if !title.is_empty() && !titles.iter().any(|item| item == title) {
                titles.push(title.chars().take(120).collect());
            }
            rest = &rest[end + 2..];
        }
        titles
    }

    fn sync_page_wikilinks(conn: &Connection, detail: &KnowledgePageDetail) -> DbResult<()> {
        let mut expected_ids = Vec::new();
        let titles = Self::extract_wikilink_titles(&format!(
            "{}\n{}",
            detail.page.content_markdown, detail.page.content_text
        ));
        for title in titles {
            let target_id: Option<String> = conn
                .query_row(
                    "SELECT id
                     FROM knowledge_nodes
                     WHERE library_id = ?1
                       AND node_type IN ('page', 'document')
                       AND title = ?2
                       AND deleted_at IS NULL
                       AND is_archived = 0
                     ORDER BY updated_at DESC
                     LIMIT 1",
                    params![detail.node.library_id, title],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(target_id) = target_id {
                if target_id != detail.node.id {
                    expected_ids.push(Self::stable_knowledge_link_id(
                        "page",
                        &detail.node.id,
                        "page",
                        Some(&target_id),
                        None,
                        "wikilink",
                    ));
                    Self::insert_knowledge_link(
                        conn,
                        "page",
                        &detail.node.id,
                        "page",
                        Some(&target_id),
                        "wikilink",
                    )?;
                }
            } else {
                expected_ids.push(Self::stable_knowledge_link_id(
                    "page",
                    &detail.node.id,
                    "missing_page",
                    None,
                    Some(&title),
                    "wikilink",
                ));
                Self::insert_knowledge_link_with_url(
                    conn,
                    "page",
                    &detail.node.id,
                    "missing_page",
                    None,
                    Some(&title),
                    "wikilink",
                )?;
            }
        }
        let mut stmt = conn.prepare(
            "SELECT id FROM knowledge_links
             WHERE source_type = 'page' AND source_id = ?1 AND link_type = 'wikilink'",
        )?;
        let existing_ids = stmt
            .query_map(params![detail.node.id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        for existing_id in existing_ids {
            if !expected_ids.iter().any(|id| id == &existing_id) {
                conn.execute("DELETE FROM knowledge_links WHERE id = ?1", params![existing_id])?;
            }
        }
        Ok(())
    }

    fn quick_note_title_from_body(body: &str) -> String {
        let first_line = body
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .unwrap_or("未命名速记");
        first_line.chars().take(60).collect()
    }

    fn quick_note_to_markdown(note: &KnowledgeQuickNote) -> String {
        let tags: Vec<String> = serde_json::from_str(&note.tags_json).unwrap_or_default();
        let mut markdown = String::from("> 来源：知识库速记\n\n");
        if !tags.is_empty() {
            let tag_line = tags
                .iter()
                .map(|tag| format!("#{}", tag.replace(' ', "-")))
                .collect::<Vec<_>>()
                .join(" ");
            markdown.push_str(&tag_line);
            markdown.push_str("\n\n");
        }
        markdown.push_str(note.body.trim());
        markdown.push('\n');
        markdown
    }

    fn insert_knowledge_link(
        conn: &Connection,
        source_type: &str,
        source_id: &str,
        target_type: &str,
        target_id: Option<&str>,
        link_type: &str,
    ) -> DbResult<()> {
        Self::insert_knowledge_link_with_url(
            conn,
            source_type,
            source_id,
            target_type,
            target_id,
            None,
            link_type,
        )
    }

    fn insert_knowledge_link_with_url(
        conn: &Connection,
        source_type: &str,
        source_id: &str,
        target_type: &str,
        target_id: Option<&str>,
        target_url: Option<&str>,
        link_type: &str,
    ) -> DbResult<()> {
        let link_id = if link_type == "wikilink" {
            Self::stable_knowledge_link_id(
                source_type,
                source_id,
                target_type,
                target_id,
                target_url,
                link_type,
            )
        } else {
            Self::new_id("link")
        };
        conn.execute(
            "DELETE FROM knowledge_links
             WHERE source_type = ?1 AND source_id = ?2 AND target_type = ?3
               AND COALESCE(target_id, '') = COALESCE(?4, '')
               AND COALESCE(target_url, '') = COALESCE(?5, '')
               AND link_type = ?6
               AND id <> ?7",
            params![
                source_type,
                source_id,
                target_type,
                target_id,
                target_url,
                link_type,
                link_id
            ],
        )?;
        conn.execute(
            "INSERT INTO knowledge_links (id, source_type, source_id, target_type, target_id, target_url, link_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                source_type = excluded.source_type,
                source_id = excluded.source_id,
                target_type = excluded.target_type,
                target_id = excluded.target_id,
                target_url = excluded.target_url,
                link_type = excluded.link_type",
            params![
                link_id,
                source_type,
                source_id,
                target_type,
                target_id,
                target_url,
                link_type
            ],
        )?;
        Ok(())
    }

    fn create_index_job(
        conn: &Connection,
        job_type: &str,
        target_type: &str,
        target_id: &str,
        status: &str,
        progress: f64,
        error_message: Option<String>,
    ) -> DbResult<KnowledgeIndexJob> {
        let id = Self::new_id("index-job");
        conn.execute(
            "INSERT INTO knowledge_index_jobs (
                id, job_type, target_type, target_id, status, progress, error_message
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                job_type,
                target_type,
                target_id,
                status,
                progress,
                error_message
            ],
        )?;
        Self::get_index_job(conn, &id)
    }

    fn get_index_job(conn: &Connection, job_id: &str) -> DbResult<KnowledgeIndexJob> {
        conn.query_row(
            "SELECT id, job_type, target_type, target_id, status, progress, error_message,
                    created_at, updated_at
             FROM knowledge_index_jobs
             WHERE id = ?1",
            params![job_id],
            Self::map_index_job,
        )
        .map_err(Into::into)
    }

    fn upsert_search_document(
        conn: &Connection,
        library_id: &str,
        source_type: &str,
        source_id: &str,
        node_id: Option<&str>,
        asset_id: Option<&str>,
        title: &str,
        body: &str,
        tags: &str,
        metadata: &str,
    ) -> DbResult<()> {
        conn.execute(
            "DELETE FROM knowledge_search_fts WHERE source_type = ?1 AND source_id = ?2",
            params![source_type, source_id],
        )?;
        conn.execute(
            "INSERT INTO knowledge_search_fts (
                library_id, source_type, source_id, node_id, asset_id, title, body, tags, metadata
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                library_id,
                source_type,
                source_id,
                node_id,
                asset_id,
                title,
                body,
                tags,
                metadata
            ],
        )?;
        Self::sync_ai_chunks(conn, source_type, source_id, body, metadata)
    }

    fn sync_ai_chunks(
        conn: &Connection,
        source_type: &str,
        source_id: &str,
        body: &str,
        metadata: &str,
    ) -> DbResult<()> {
        conn.execute(
            "DELETE FROM knowledge_ai_chunks WHERE source_type = ?1 AND source_id = ?2",
            params![source_type, source_id],
        )?;
        let content = body.trim();
        if content.is_empty() {
            return Ok(());
        }
        for (index, chunk) in Self::split_text_chunks(content, 1800)
            .into_iter()
            .enumerate()
        {
            conn.execute(
                "INSERT INTO knowledge_ai_chunks (
                    id, source_type, source_id, chunk_index, content_text, token_count, metadata_json
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    Self::new_id("chunk"),
                    source_type,
                    source_id,
                    index as i64,
                    chunk,
                    (chunk.chars().count() / 2).max(1) as i64,
                    metadata
                ],
            )?;
        }
        Ok(())
    }

    fn split_text_chunks(text: &str, max_chars: usize) -> Vec<String> {
        let mut chunks = Vec::new();
        let mut current = String::new();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if current.chars().count() + line.chars().count() + 1 > max_chars && !current.is_empty()
            {
                chunks.push(current.trim().to_string());
                current.clear();
            }
            current.push_str(line);
            current.push('\n');
        }
        if !current.trim().is_empty() {
            chunks.push(current.trim().to_string());
        }
        chunks
    }

    fn backfill_search_index(conn: &Connection, library_id: &str) -> DbResult<()> {
        let pages = {
            let mut stmt = conn.prepare(
                "SELECT n.id, n.library_id, n.title, p.content_text, p.content_markdown,
                        COALESCE(p.properties_json, ''), p.source_asset_id, n.node_type
                 FROM knowledge_nodes n
                 INNER JOIN knowledge_pages p ON p.id = n.id
                 WHERE n.library_id = ?1
                   AND n.deleted_at IS NULL
                   AND n.is_archived = 0",
            )?;
            let rows = stmt
                .query_map(params![library_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, String>(7)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        for (
            id,
            library_id,
            title,
            content_text,
            content_markdown,
            metadata,
            asset_id,
            node_type,
        ) in pages
        {
            let body = if content_text.trim().is_empty() {
                content_markdown
            } else {
                content_text
            };
            let source_type = if node_type == "document" {
                "document"
            } else {
                "page"
            };
            Self::upsert_search_document(
                conn,
                &library_id,
                source_type,
                &id,
                Some(&id),
                asset_id.as_deref(),
                &title,
                &body,
                "",
                &metadata,
            )?;
        }

        let notes = {
            let mut stmt = conn.prepare(
                "SELECT q.id, q.library_id, q.node_id, q.title, q.body, q.tags_json
                 FROM knowledge_quick_notes q
                 INNER JOIN knowledge_nodes n ON n.id = q.node_id
                 WHERE q.library_id = ?1
                   AND n.deleted_at IS NULL
                   AND n.is_archived = 0",
            )?;
            let rows = stmt
                .query_map(params![library_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        for (id, library_id, node_id, title, body, tags) in notes {
            Self::upsert_search_document(
                conn,
                &library_id,
                "quick_note",
                &id,
                Some(&node_id),
                None,
                &title,
                &body,
                &tags,
                "",
            )?;
        }

        let assets = {
            let mut stmt = conn.prepare(
                "SELECT a.id, a.library_id, a.original_name, a.extracted_text,
                        COALESCE(a.metadata_json, ''), p.id
                 FROM knowledge_assets a
                 LEFT JOIN knowledge_pages p ON p.source_asset_id = a.id
                 LEFT JOIN knowledge_nodes n ON n.id = p.id
                 WHERE a.library_id = ?1
                   AND (n.deleted_at IS NULL OR n.id IS NULL)",
            )?;
            let rows = stmt
                .query_map(params![library_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        for (id, library_id, title, body, metadata, node_id) in assets {
            Self::upsert_search_document(
                conn,
                &library_id,
                "asset",
                &id,
                node_id.as_deref(),
                Some(&id),
                &title,
                &body,
                "",
                &metadata,
            )?;
        }
        Ok(())
    }

    fn get_asset_by_hash(
        conn: &Connection,
        library_id: &str,
        hash: &str,
    ) -> DbResult<Option<KnowledgeAsset>> {
        conn.query_row(
            "SELECT id, library_id, hash, original_name, mime_type, extension, size_bytes,
                    storage_path, original_path, preview_path, thumbnail_path, extracted_text,
                    metadata_json, import_status, created_at, updated_at
             FROM knowledge_assets
             WHERE library_id = ?1 AND hash = ?2
             ORDER BY created_at ASC
             LIMIT 1",
            params![library_id, hash],
            Self::map_asset,
        )
        .optional()
        .map_err(Into::into)
    }

    fn get_document_id_by_asset(conn: &Connection, asset_id: &str) -> DbResult<Option<String>> {
        conn.query_row(
            "SELECT p.id
             FROM knowledge_pages p
             INNER JOIN knowledge_nodes n ON n.id = p.id
             WHERE p.source_asset_id = ?1
               AND n.node_type IN ('document', 'page')
               AND n.deleted_at IS NULL
             ORDER BY n.created_at ASC
             LIMIT 1",
            params![asset_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(Into::into)
    }

    fn document_title_from_name(name: &str) -> String {
        let title = name
            .rsplit_once('.')
            .map(|(stem, _)| stem)
            .unwrap_or(name)
            .trim();
        if title.is_empty() {
            "未命名文档".to_string()
        } else {
            title.chars().take(80).collect()
        }
    }

    fn document_icon(extension: &str) -> &'static str {
        match extension.trim_start_matches('.').to_ascii_lowercase().as_str() {
            "md" | "markdown" => "file-type",
            "pdf" => "file-type-2",
            "doc" | "docx" => "file-type-2",
            "ppt" | "pptx" => "presentation",
            "xls" | "xlsx" | "csv" => "sheet",
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => "image",
            _ => "file",
        }
    }

    fn page_icon(page_type: &str) -> &'static str {
        match page_type {
            "markdown" => "file-type",
            "block" => "layout-template",
            "canvas" => "layout-dashboard",
            "external_document" => "file-search",
            _ => "file-type",
        }
    }

    fn get_tag(conn: &Connection, tag_id: &str) -> DbResult<KnowledgeTag> {
        conn.query_row(
            "SELECT id, library_id, name, color, created_at
             FROM knowledge_tags
             WHERE id = ?1",
            params![tag_id],
            Self::map_tag,
        )
        .map_err(Into::into)
    }

    fn get_tag_by_name(conn: &Connection, library_id: &str, name: &str) -> DbResult<KnowledgeTag> {
        conn.query_row(
            "SELECT id, library_id, name, color, created_at
             FROM knowledge_tags
             WHERE library_id = ?1 AND name = ?2",
            params![library_id, name],
            Self::map_tag,
        )
        .map_err(Into::into)
    }

    fn tagged_target_ids(
        conn: &Connection,
        tag_id: &str,
        target_type: &str,
    ) -> DbResult<HashSet<String>> {
        let mut stmt = conn.prepare(
            "SELECT target_id FROM knowledge_tag_bindings
             WHERE tag_id = ?1 AND target_type = ?2",
        )?;
        let ids = stmt
            .query_map(params![tag_id, target_type], |row| row.get::<_, String>(0))?
            .collect::<Result<HashSet<_>, _>>()?;
        Ok(ids)
    }

    fn linked_todo_ids(conn: &Connection, page_ids: &HashSet<String>) -> DbResult<HashSet<String>> {
        if page_ids.is_empty() {
            return Ok(HashSet::new());
        }
        let mut stmt = conn.prepare(
            "SELECT DISTINCT
                    CASE
                      WHEN source_type = 'todo' THEN source_id
                      WHEN target_type = 'todo' THEN target_id
                      ELSE NULL
                    END AS todo_id,
                    source_type,
                    source_id,
                    target_type,
                    target_id
             FROM knowledge_links
             WHERE (source_type = 'page' AND target_type = 'todo')
                OR (source_type = 'todo' AND target_type = 'page')",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let mut ids = HashSet::new();
        for (todo_id, source_type, source_id, target_type, target_id) in rows {
            let connected_page_id = if source_type == "page" {
                Some(source_id)
            } else if target_type == "page" {
                target_id
            } else {
                None
            };
            if connected_page_id
                .as_ref()
                .is_some_and(|id| page_ids.contains(id))
            {
                if let Some(todo_id) = todo_id {
                    ids.insert(todo_id);
                }
            }
        }
        Ok(ids)
    }

    fn graph_assets(
        conn: &Connection,
        asset_ids: &HashSet<String>,
        limit: i64,
    ) -> DbResult<Vec<KnowledgeAsset>> {
        if asset_ids.is_empty() {
            return Ok(Vec::new());
        }
        let mut assets = Vec::new();
        for asset_id in asset_ids.iter().take(limit as usize) {
            if let Ok(asset) = Self::get_asset(conn, asset_id) {
                assets.push(asset);
            }
        }
        Ok(assets)
    }

    fn graph_todos(
        conn: &Connection,
        todo_ids: &HashSet<String>,
        limit: i64,
    ) -> DbResult<Vec<(String, String, bool)>> {
        if todo_ids.is_empty() {
            return Ok(Vec::new());
        }
        let mut todos = Vec::new();
        let mut stmt = conn.prepare("SELECT id, title, is_completed FROM todos WHERE id = ?1")?;
        for todo_id in todo_ids.iter().take(limit as usize) {
            let todo = stmt
                .query_row(params![todo_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)? != 0,
                    ))
                })
                .optional()?;
            if let Some(todo) = todo {
                todos.push(todo);
            }
        }
        Ok(todos)
    }

    fn graph_edges(
        conn: &Connection,
        node_keys: &HashSet<String>,
        limit: i64,
    ) -> DbResult<Vec<KnowledgeGraphEdge>> {
        let mut stmt = conn.prepare(
            "SELECT id, source_type, source_id, target_type, target_id, link_type
             FROM knowledge_links
             WHERE target_id IS NOT NULL
             ORDER BY created_at DESC
             LIMIT ?1",
        )?;
        let links = stmt
            .query_map(params![limit * 2], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let mut edges = Vec::new();
        for (id, source_type, source_id, target_type, target_id, link_type) in links {
            let Some(target_id) = target_id else {
                continue;
            };
            let source_key = Self::graph_node_key(&source_type, &source_id);
            let target_key = Self::graph_node_key(&target_type, &target_id);
            if node_keys.contains(&source_key) && node_keys.contains(&target_key) {
                edges.push(KnowledgeGraphEdge {
                    id,
                    source: source_key,
                    target: target_key,
                    label: Some(link_type.clone()),
                    link_type,
                });
            }
        }
        Ok(edges)
    }

    fn document_asset_edges(
        conn: &Connection,
        page_ids: &HashSet<String>,
        node_keys: &HashSet<String>,
    ) -> DbResult<Vec<KnowledgeGraphEdge>> {
        let mut edges = Vec::new();
        let mut stmt = conn.prepare("SELECT source_asset_id FROM knowledge_pages WHERE id = ?1")?;
        for page_id in page_ids {
            let asset_id: Option<String> = stmt
                .query_row(params![page_id], |row| row.get(0))
                .optional()?
                .flatten();
            if let Some(asset_id) = asset_id {
                let source = format!("page:{page_id}");
                let target = format!("asset:{asset_id}");
                if node_keys.contains(&source) && node_keys.contains(&target) {
                    edges.push(KnowledgeGraphEdge {
                        id: format!("source-asset-{page_id}-{asset_id}"),
                        source,
                        target,
                        link_type: "source_asset".to_string(),
                        label: Some("附件".to_string()),
                    });
                }
            }
        }
        Ok(edges)
    }

    fn graph_node_key(target_type: &str, target_id: &str) -> String {
        match target_type {
            "document" => format!("page:{target_id}"),
            "page" => format!("page:{target_id}"),
            "asset" => format!("asset:{target_id}"),
            "todo" => format!("todo:{target_id}"),
            "quick_note" => format!("quick_note:{target_id}"),
            _ => format!("{target_type}:{target_id}"),
        }
    }

    fn normalize_index_status(value: Option<String>) -> DbResult<String> {
        let status =
            Self::normalize_optional_text(value).unwrap_or_else(|| "succeeded".to_string());
        match status.as_str() {
            "pending" | "running" | "succeeded" | "failed" | "cancelled" => Ok(status),
            _ => Err(DbError::InvalidParameter(format!(
                "不支持的索引任务状态: {}",
                status
            ))),
        }
    }

    fn normalize_search_source_type(value: Option<String>) -> DbResult<Option<String>> {
        match Self::normalize_optional_text(value) {
            Some(source_type) => match source_type.as_str() {
                "page" | "document" | "quick_note" | "asset" => Ok(Some(source_type)),
                _ => Err(DbError::InvalidParameter(format!(
                    "不支持的搜索类型: {}",
                    source_type
                ))),
            },
            None => Ok(None),
        }
    }

    fn score_search_result(
        query: &str,
        title: &str,
        body: &str,
        tags: &str,
        metadata: &str,
    ) -> f64 {
        let title = title.to_lowercase();
        let body = body.to_lowercase();
        let tags = tags.to_lowercase();
        let metadata = metadata.to_lowercase();
        let mut score = 0.0;
        if title == query {
            score += 80.0;
        } else if title.contains(query) {
            score += 50.0;
        }
        if tags.contains(query) {
            score += 30.0;
        }
        if body.contains(query) {
            score += 20.0;
        }
        if metadata.contains(query) {
            score += 8.0;
        }
        score
    }

    fn build_snippet(query: &str, candidates: &[&str]) -> String {
        for candidate in candidates {
            let normalized = candidate.replace('\n', " ");
            let lower = normalized.to_lowercase();
            if let Some(byte_index) = lower.find(query) {
                let start = normalized[..byte_index].chars().count().saturating_sub(36);
                let snippet: String = normalized.chars().skip(start).take(120).collect();
                return snippet.trim().to_string();
            }
        }
        candidates
            .iter()
            .map(|item| item.replace('\n', " "))
            .find(|item| !item.trim().is_empty())
            .map(|item| item.chars().take(120).collect::<String>())
            .unwrap_or_default()
            .trim()
            .to_string()
    }

    fn new_id(prefix: &str) -> String {
        format!("{}-{}", prefix, Uuid::new_v4().simple())
    }

    fn stable_knowledge_link_id(
        source_type: &str,
        source_id: &str,
        target_type: &str,
        target_id: Option<&str>,
        target_url: Option<&str>,
        link_type: &str,
    ) -> String {
        let seed = [
            source_type,
            source_id,
            target_type,
            target_id.unwrap_or(""),
            target_url.unwrap_or(""),
            link_type,
        ]
        .join("\u{1f}");
        let digest = Sha256::digest(seed.as_bytes());
        format!("link-{:x}", digest)[..37].to_string()
    }

    fn map_library(row: &Row<'_>) -> rusqlite::Result<KnowledgeLibrary> {
        Ok(KnowledgeLibrary {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            is_default: row.get::<_, i64>(3)? != 0,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }

    fn map_space(row: &Row<'_>) -> rusqlite::Result<KnowledgeSpace> {
        Ok(KnowledgeSpace {
            id: row.get(0)?,
            library_id: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            icon: row.get(4)?,
            color: row.get(5)?,
            sort_order: row.get(6)?,
            is_default: row.get::<_, i64>(7)? != 0,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }

    fn map_node(row: &Row<'_>) -> rusqlite::Result<KnowledgeNode> {
        Self::map_node_at(row, 0)
    }

    fn map_node_at(row: &Row<'_>, offset: usize) -> rusqlite::Result<KnowledgeNode> {
        Ok(KnowledgeNode {
            id: row.get(offset)?,
            library_id: row.get(offset + 1)?,
            space_id: row.get(offset + 2)?,
            parent_id: row.get(offset + 3)?,
            node_type: row.get(offset + 4)?,
            title: row.get(offset + 5)?,
            icon: row.get(offset + 6)?,
            sort_order: row.get(offset + 7)?,
            is_archived: row.get::<_, i64>(offset + 8)? != 0,
            is_favorite: row.get::<_, i64>(offset + 9)? != 0,
            created_at: row.get(offset + 10)?,
            updated_at: row.get(offset + 11)?,
            deleted_at: row.get(offset + 12)?,
        })
    }

    fn map_page(row: &Row<'_>) -> rusqlite::Result<KnowledgePage> {
        Ok(KnowledgePage {
            id: row.get(0)?,
            page_type: row.get(1)?,
            content_markdown: row.get(2)?,
            content_json: row.get(3)?,
            content_text: row.get(4)?,
            properties_json: row.get(5)?,
            source_asset_id: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }

    fn map_quick_note(row: &Row<'_>) -> rusqlite::Result<KnowledgeQuickNote> {
        Self::map_quick_note_at(row, 0)
    }

    fn map_quick_note_at(row: &Row<'_>, offset: usize) -> rusqlite::Result<KnowledgeQuickNote> {
        Ok(KnowledgeQuickNote {
            id: row.get(offset)?,
            library_id: row.get(offset + 1)?,
            node_id: row.get(offset + 2)?,
            title: row.get(offset + 3)?,
            body: row.get(offset + 4)?,
            tags_json: row.get(offset + 5)?,
            color: row.get(offset + 6)?,
            is_pinned: row.get::<_, i64>(offset + 7)? != 0,
            converted_page_id: row.get(offset + 8)?,
            converted_todo_id: row.get(offset + 9)?,
            created_at: row.get(offset + 10)?,
            updated_at: row.get(offset + 11)?,
        })
    }

    fn map_asset(row: &Row<'_>) -> rusqlite::Result<KnowledgeAsset> {
        Ok(KnowledgeAsset {
            id: row.get(0)?,
            library_id: row.get(1)?,
            hash: row.get(2)?,
            original_name: row.get(3)?,
            mime_type: row.get(4)?,
            extension: row.get(5)?,
            size_bytes: row.get(6)?,
            storage_path: row.get(7)?,
            original_path: row.get(8)?,
            preview_path: row.get(9)?,
            thumbnail_path: row.get(10)?,
            extracted_text: row.get(11)?,
            metadata_json: row.get(12)?,
            import_status: row.get(13)?,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
        })
    }

    fn map_tag(row: &Row<'_>) -> rusqlite::Result<KnowledgeTag> {
        Ok(KnowledgeTag {
            id: row.get(0)?,
            library_id: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
        })
    }

    fn map_link(row: &Row<'_>) -> rusqlite::Result<KnowledgeLink> {
        Ok(KnowledgeLink {
            id: row.get(0)?,
            source_type: row.get(1)?,
            source_id: row.get(2)?,
            target_type: row.get(3)?,
            target_id: row.get(4)?,
            target_url: row.get(5)?,
            link_type: row.get(6)?,
            created_at: row.get(7)?,
        })
    }

    fn map_index_job(row: &Row<'_>) -> rusqlite::Result<KnowledgeIndexJob> {
        Ok(KnowledgeIndexJob {
            id: row.get(0)?,
            job_type: row.get(1)?,
            target_type: row.get(2)?,
            target_id: row.get(3)?,
            status: row.get(4)?,
            progress: row.get(5)?,
            error_message: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }

    fn map_ai_chunk(row: &Row<'_>) -> rusqlite::Result<KnowledgeAiChunk> {
        Ok(KnowledgeAiChunk {
            id: row.get(0)?,
            source_type: row.get(1)?,
            source_id: row.get(2)?,
            chunk_index: row.get(3)?,
            content_text: row.get(4)?,
            token_count: row.get(5)?,
            metadata_json: row.get(6)?,
            created_at: row.get(7)?,
        })
    }

    fn map_embedding_candidate(row: &Row<'_>) -> rusqlite::Result<KnowledgeEmbeddingCandidate> {
        Ok(KnowledgeEmbeddingCandidate {
            chunk_id: row.get(0)?,
            source_type: row.get(1)?,
            source_id: row.get(2)?,
            node_id: row.get(3)?,
            asset_id: row.get(4)?,
            title: row.get(5)?,
            content_text: row.get(6)?,
            metadata_json: row.get(7)?,
            updated_at: row.get(8)?,
            vector_blob: row.get(9)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CreateTodoInput;
    use crate::services::TodoService;

    fn db() -> Database {
        Database::new_in_memory().unwrap()
    }

    #[test]
    fn test_default_knowledge_structure_is_created() {
        let db = db();
        let libraries = KnowledgeService::list_libraries(&db).unwrap();
        assert_eq!(libraries.len(), 1);
        assert!(libraries[0].is_default);

        let spaces = KnowledgeService::list_spaces(&db, None).unwrap();
        assert_eq!(spaces.len(), 1);
        assert!(spaces[0].is_default);

        let tree = KnowledgeService::list_tree(&db, None).unwrap();
        assert!(tree
            .iter()
            .any(|node| node.id == KnowledgeService::DEFAULT_INBOX_NODE_ID));
    }

    #[test]
    fn test_create_space_folder_and_page() {
        let db = db();
        let library = KnowledgeService::create_library(
            &db,
            CreateKnowledgeLibraryInput {
                name: "项目资料".to_string(),
                description: Some("项目文档".to_string()),
            },
        )
        .unwrap();
        let space = KnowledgeService::create_space(
            &db,
            CreateKnowledgeSpaceInput {
                library_id: Some(library.id.clone()),
                name: "GuYanTools".to_string(),
                description: None,
                icon: None,
                color: None,
                sort_order: None,
            },
        )
        .unwrap();
        let folder = KnowledgeService::create_folder(
            &db,
            CreateKnowledgeFolderInput {
                library_id: Some(library.id.clone()),
                space_id: Some(space.id.clone()),
                parent_id: None,
                title: "开发记录".to_string(),
                icon: None,
                sort_order: None,
            },
        )
        .unwrap();
        let page = KnowledgeService::create_page(
            &db,
            CreateKnowledgePageInput {
                library_id: None,
                space_id: None,
                parent_id: Some(folder.id.clone()),
                title: "V0.2".to_string(),
                page_type: None,
                content_markdown: Some("# V0.2".to_string()),
                content_json: None,
                content_text: None,
                properties_json: None,
                sort_order: None,
            },
        )
        .unwrap();

        assert_eq!(page.node.parent_id.as_deref(), Some(folder.id.as_str()));
        assert_eq!(page.page.content_text, "# V0.2");
    }

    #[test]
    fn test_manage_libraries_and_spaces_without_removing_defaults() {
        let db = db();
        let library = KnowledgeService::create_library(
            &db,
            CreateKnowledgeLibraryInput {
                name: "旧知识库".to_string(),
                description: Some("旧描述".to_string()),
            },
        )
        .unwrap();

        let renamed_library = KnowledgeService::update_library(
            &db,
            &library.id,
            UpdateKnowledgeLibraryInput {
                name: Some("项目知识库".to_string()),
                description: Some("项目资料目录".to_string()),
            },
        )
        .unwrap();
        assert_eq!(renamed_library.name, "项目知识库");
        assert_eq!(renamed_library.description, "项目资料目录");

        let space = KnowledgeService::create_space(
            &db,
            CreateKnowledgeSpaceInput {
                library_id: Some(library.id.clone()),
                name: "旧空间".to_string(),
                description: None,
                icon: None,
                color: None,
                sort_order: Some(3),
            },
        )
        .unwrap();
        let renamed_space = KnowledgeService::update_space(
            &db,
            &space.id,
            UpdateKnowledgeSpaceInput {
                name: Some("研发空间".to_string()),
                description: Some("研发资料".to_string()),
                icon: Some("file-stack".to_string()),
                color: Some("#22c55e".to_string()),
                sort_order: Some(1),
            },
        )
        .unwrap();
        assert_eq!(renamed_space.name, "研发空间");
        assert_eq!(renamed_space.sort_order, 1);

        let spaces = KnowledgeService::list_spaces(&db, Some(library.id.clone())).unwrap();
        assert_eq!(spaces[0].sort_order, 0);
        assert_eq!(spaces[1].id, space.id);

        KnowledgeService::delete_space(&db, &space.id).unwrap();
        let remaining_spaces = KnowledgeService::list_spaces(&db, Some(library.id.clone())).unwrap();
        assert!(remaining_spaces.iter().all(|item| item.id != space.id));

        KnowledgeService::delete_library(&db, &library.id).unwrap();
        let libraries = KnowledgeService::list_libraries(&db).unwrap();
        assert!(libraries.iter().all(|item| item.id != library.id));
        assert!(KnowledgeService::delete_library(&db, KnowledgeService::DEFAULT_LIBRARY_ID).is_err());
        assert!(KnowledgeService::delete_space(&db, KnowledgeService::DEFAULT_SPACE_ID).is_err());
    }

    #[test]
    fn test_apply_sync_object_imports_knowledge_tree_page_tag_and_link() {
        let db = db();

        KnowledgeService::apply_sync_object(
            &db,
            "knowledge.library",
            r##"{"id":"sync-library-a","name":"Research","description":"Remote","isDefault":false,"createdAt":"2026-06-15 10:00:00","updatedAt":"2026-06-15 10:00:00"}"##,
        )
        .unwrap();
        KnowledgeService::apply_sync_object(
            &db,
            "knowledge.space",
            r##"{"id":"sync-space-a","libraryId":"sync-library-a","name":"Notes","description":"","icon":"library","color":"#4A90D9","sortOrder":2,"isDefault":false,"createdAt":"2026-06-15 10:00:00","updatedAt":"2026-06-15 10:00:00"}"##,
        )
        .unwrap();
        KnowledgeService::apply_sync_object(
            &db,
            "knowledge.folder",
            r##"{"id":"sync-folder-a","libraryId":"sync-library-a","spaceId":"sync-space-a","parentId":null,"nodeType":"folder","title":"Folder","icon":"folder","sortOrder":1,"isArchived":false,"isFavorite":false,"createdAt":"2026-06-15 10:00:00","updatedAt":"2026-06-15 10:00:00","deletedAt":null}"##,
        )
        .unwrap();
        KnowledgeService::apply_sync_object(
            &db,
            "knowledge.page",
            r##"{"node":{"id":"sync-page-a","libraryId":"sync-library-a","spaceId":"sync-space-a","parentId":"sync-folder-a","nodeType":"page","title":"Remote Note","icon":null,"sortOrder":3,"isArchived":false,"isFavorite":true,"createdAt":"2026-06-15 10:00:00","updatedAt":"2026-06-15 10:00:00","deletedAt":null},"page":{"id":"sync-page-a","pageType":"markdown","contentMarkdown":"# Remote Note\n\nsync phrase","contentJson":null,"contentText":"sync phrase","propertiesJson":"{\"source\":\"sync\"}","sourceAssetId":null,"createdAt":"2026-06-15 10:00:00","updatedAt":"2026-06-15 10:00:00"}}"##,
        )
        .unwrap();
        KnowledgeService::apply_sync_object(
            &db,
            "knowledge.tag",
            r##"{"id":"sync-tag-a","libraryId":"sync-library-a","name":"项目","color":"#22c55e","createdAt":"2026-06-15 10:00:00"}"##,
        )
        .unwrap();
        KnowledgeService::apply_sync_object(
            &db,
            "knowledge.link",
            r##"{"id":"sync-link-a","sourceType":"page","sourceId":"sync-page-a","targetType":"page","targetId":"sync-page-a","targetUrl":null,"linkType":"reference","createdAt":"2026-06-15 10:00:00"}"##,
        )
        .unwrap();

        let page = KnowledgeService::get_page(&db, "sync-page-a").unwrap();
        assert_eq!(page.node.parent_id.as_deref(), Some("sync-folder-a"));
        assert!(page.node.is_favorite);
        assert_eq!(page.page.content_text, "sync phrase");

        let results = KnowledgeService::search_knowledge(
            &db,
            KnowledgeSearchInput {
                library_id: Some("sync-library-a".to_string()),
                space_id: None,
                query: "sync phrase".to_string(),
                source_type: Some("page".to_string()),
                limit: Some(10),
            },
        )
        .unwrap();
        assert!(results.iter().any(|result| result.source_id == "sync-page-a"));

        let links = KnowledgeService::list_page_links(&db, "sync-page-a").unwrap();
        assert!(links.iter().any(|link| link.id == "sync-link-a"));
    }

    #[test]
    fn test_apply_sync_asset_uses_downloaded_storage_path() {
        let db = db();
        KnowledgeService::apply_sync_object(
            &db,
            "knowledge.library",
            r##"{"id":"sync-library-asset","name":"Assets","description":"","isDefault":false,"createdAt":"2026-06-15 10:00:00","updatedAt":"2026-06-15 10:00:00"}"##,
        )
        .unwrap();

        KnowledgeService::apply_sync_object(
            &db,
            "knowledge.asset",
            r##"{"id":"sync-asset-a","libraryId":"sync-library-asset","hash":"sync-asset-hash","originalName":"remote.png","mimeType":"image/png","extension":".png","sizeBytes":12,"storagePath":"D:/GuYanTools/knowledge-assets/sync-asset-hash.png","extractedText":"","metadataJson":null,"importStatus":"ready","createdAt":"2026-06-15 10:00:00","updatedAt":"2026-06-15 10:00:00"}"##,
        )
        .unwrap();

        let asset = KnowledgeService::get_asset_by_id(&db, "sync-asset-a").unwrap();
        assert_eq!(asset.storage_path, "D:/GuYanTools/knowledge-assets/sync-asset-hash.png");
    }

    #[test]
    fn test_apply_sync_object_keeps_same_name_different_id_pages() {
        let db = db();

        for suffix in ["a", "b"] {
            KnowledgeService::apply_sync_object(
                &db,
                "knowledge.library",
                &format!(
                    r##"{{"id":"sync-library-{suffix}","name":"Research","description":"","isDefault":false}}"##
                ),
            )
            .unwrap();
            KnowledgeService::apply_sync_object(
                &db,
                "knowledge.page",
                &format!(
                    r##"{{"node":{{"id":"sync-page-{suffix}","libraryId":"sync-library-{suffix}","spaceId":null,"parentId":null,"nodeType":"page","title":"Same Name","sortOrder":0,"isArchived":false,"isFavorite":false}},"page":{{"id":"sync-page-{suffix}","pageType":"markdown","contentMarkdown":"page {suffix}","contentText":"page {suffix}"}}}}"##
                ),
            )
            .unwrap();
        }

        let libraries = KnowledgeService::list_libraries(&db).unwrap();
        assert!(libraries.iter().any(|item| item.id == "sync-library-a"));
        assert!(libraries.iter().any(|item| item.id == "sync-library-b"));

        let tree_a = KnowledgeService::list_tree(
            &db,
            Some(ListKnowledgeTreeInput {
                library_id: Some("sync-library-a".to_string()),
                space_id: None,
                parent_id: None,
                include_archived: Some(true),
            }),
        )
        .unwrap();
        let tree_b = KnowledgeService::list_tree(
            &db,
            Some(ListKnowledgeTreeInput {
                library_id: Some("sync-library-b".to_string()),
                space_id: None,
                parent_id: None,
                include_archived: Some(true),
            }),
        )
        .unwrap();
        assert!(tree_a.iter().any(|node| node.id == "sync-page-a"));
        assert!(tree_b.iter().any(|node| node.id == "sync-page-b"));
    }

    #[test]
    fn test_markdown_import_creates_normal_markdown_page() {
        let db = db();
        let imported = KnowledgeService::import_document(
            &db,
            ImportKnowledgeDocumentInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                hash: "hash-md".to_string(),
                original_name: "meeting-notes.md".to_string(),
                mime_type: Some("text/markdown".to_string()),
                extension: Some(".md".to_string()),
                size_bytes: 32,
                storage_path: "/tmp/meeting-notes.md".to_string(),
                original_path: None,
                extracted_text: Some("# Meeting\n\n正文".to_string()),
                metadata_json: Some(r#"{"sourceType":"markdown_import"}"#.to_string()),
                extraction_status: Some("succeeded".to_string()),
                extraction_error: None,
            },
        )
        .unwrap();

        assert_eq!(imported.document.node.node_type, "page");
        assert_eq!(imported.document.page.page_type, "markdown");
        assert_eq!(imported.document.page.content_markdown, "# Meeting\n\n正文");
        assert_eq!(imported.document.page.content_text, "# Meeting\n\n正文");
        assert_eq!(imported.document.page.source_asset_id.as_deref(), Some(imported.asset.id.as_str()));
    }

    #[test]
    fn test_block_page_content_json_updates_and_searches() {
        let db = db();
        let block_json = r#"{"type":"guyantools.block-page","version":1,"blocks":[{"id":"block-1","type":"paragraph","text":"块页面 索引短语"}]}"#;
        let page = KnowledgeService::create_page(
            &db,
            CreateKnowledgePageInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "块页面测试".to_string(),
                page_type: Some("block".to_string()),
                content_markdown: Some("块页面 索引短语".to_string()),
                content_json: Some(block_json.to_string()),
                content_text: Some("块页面 索引短语".to_string()),
                properties_json: Some(r#"{"editor":"block"}"#.to_string()),
                sort_order: None,
            },
        )
        .unwrap();

        assert_eq!(page.page.page_type, "block");
        assert!(page
            .page
            .content_json
            .as_deref()
            .unwrap()
            .contains("guyantools.block-page"));

        let results = KnowledgeService::search_knowledge(
            &db,
            KnowledgeSearchInput {
                library_id: None,
                space_id: None,
                query: "索引短语".to_string(),
                source_type: Some("page".to_string()),
                limit: Some(10),
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_id, page.node.id);

        let updated_json = r#"{"type":"guyantools.block-page","version":1,"blocks":[{"id":"block-1","type":"paragraph","text":"块页面 更新短语"}]}"#;
        let updated = KnowledgeService::update_page(
            &db,
            &page.node.id,
            UpdateKnowledgePageInput {
                title: None,
                content_markdown: Some("块页面 更新短语".to_string()),
                content_json: Some(updated_json.to_string()),
                content_text: Some("块页面 更新短语".to_string()),
                properties_json: Some(r#"{"editor":"block","schemaVersion":1}"#.to_string()),
                sort_order: None,
            },
        )
        .unwrap();

        assert!(updated
            .page
            .content_json
            .as_deref()
            .unwrap()
            .contains("更新短语"));

        let updated_results = KnowledgeService::search_knowledge(
            &db,
            KnowledgeSearchInput {
                library_id: None,
                space_id: None,
                query: "更新短语".to_string(),
                source_type: Some("page".to_string()),
                limit: Some(10),
            },
        )
        .unwrap();
        assert_eq!(updated_results.len(), 1);
        assert_eq!(updated_results[0].source_id, updated.node.id);
    }

    #[test]
    fn test_ai_chunks_and_embeddings_can_rebuild() {
        let db = db();
        let page = KnowledgeService::create_page(
            &db,
            CreateKnowledgePageInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "AI 分块页面".to_string(),
                page_type: None,
                content_markdown: Some(
                    "第一段用于 embedding。\n第二段继续用于 embedding。".to_string(),
                ),
                content_json: None,
                content_text: None,
                properties_json: None,
                sort_order: None,
            },
        )
        .unwrap();

        let chunks = KnowledgeService::list_ai_chunks(
            &db,
            Some(ListKnowledgeAiChunksInput {
                source_type: Some("page".to_string()),
                source_id: Some(page.node.id),
                missing_embedding_provider: None,
                missing_embedding_model: None,
                limit: Some(10),
            }),
        )
        .unwrap();
        assert_eq!(chunks.len(), 1);

        KnowledgeService::upsert_embedding(
            &db,
            UpsertKnowledgeEmbeddingInput {
                id: "embedding-1".to_string(),
                chunk_id: chunks[0].id.clone(),
                provider: "openai".to_string(),
                model: "text-embedding-3-small".to_string(),
                dimension: 3,
                vector_blob: vec![0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 0, 64],
            },
        )
        .unwrap();

        let stats =
            KnowledgeService::embedding_stats(&db, "openai", "text-embedding-3-small").unwrap();
        assert_eq!(stats.chunk_count, 1);
        assert_eq!(stats.embedded_count, 1);

        let candidates = KnowledgeService::list_embedding_candidates(
            &db,
            ListKnowledgeEmbeddingCandidatesInput {
                provider: "openai".to_string(),
                model: "text-embedding-3-small".to_string(),
                library_id: None,
                space_id: None,
                source_type: Some("page".to_string()),
                limit: Some(10),
            },
        )
        .unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].title, "AI 分块页面");
        assert_eq!(candidates[0].vector_blob.len(), 12);
        assert!(candidates[0].content_text.contains("第一段"));

        let missing = KnowledgeService::list_ai_chunks(
            &db,
            Some(ListKnowledgeAiChunksInput {
                source_type: None,
                source_id: None,
                missing_embedding_provider: Some("openai".to_string()),
                missing_embedding_model: Some("text-embedding-3-small".to_string()),
                limit: Some(10),
            }),
        )
        .unwrap();
        assert!(missing.is_empty());

        let deleted =
            KnowledgeService::delete_embeddings(&db, "openai", "text-embedding-3-small").unwrap();
        assert_eq!(deleted, 1);
        let stats =
            KnowledgeService::embedding_stats(&db, "openai", "text-embedding-3-small").unwrap();
        assert_eq!(stats.embedded_count, 0);
    }

    #[test]
    fn test_canvas_page_content_json_updates_and_searches() {
        let db = db();
        let canvas_json = r##"{"type":"guyantools.canvas-page","version":1,"width":1800,"height":1200,"elements":[{"id":"canvas-1","type":"text","x":120,"y":120,"width":260,"height":96,"text":"画布页面 检索短语","stroke":"#4A90D9","fill":"transparent"}]}"##;
        let page = KnowledgeService::create_page(
            &db,
            CreateKnowledgePageInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "画布页面测试".to_string(),
                page_type: Some("canvas".to_string()),
                content_markdown: Some("画布页面 检索短语".to_string()),
                content_json: Some(canvas_json.to_string()),
                content_text: Some("画布页面 检索短语".to_string()),
                properties_json: Some(r#"{"editor":"canvas"}"#.to_string()),
                sort_order: None,
            },
        )
        .unwrap();

        assert_eq!(page.node.icon.as_deref(), Some("layout-dashboard"));
        assert_eq!(page.page.page_type, "canvas");
        assert!(page
            .page
            .content_json
            .as_deref()
            .unwrap()
            .contains("guyantools.canvas-page"));

        let results = KnowledgeService::search_knowledge(
            &db,
            KnowledgeSearchInput {
                library_id: None,
                space_id: None,
                query: "检索短语".to_string(),
                source_type: Some("page".to_string()),
                limit: Some(10),
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_id, page.node.id);
    }

    #[test]
    fn test_tags_wikilinks_graph_todo_and_orphans() {
        let db = db();
        let page_b = KnowledgeService::create_page(
            &db,
            CreateKnowledgePageInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "页面 B".to_string(),
                page_type: None,
                content_markdown: Some("目标页面".to_string()),
                content_json: None,
                content_text: None,
                properties_json: None,
                sort_order: None,
            },
        )
        .unwrap();
        let page_a = KnowledgeService::create_page(
            &db,
            CreateKnowledgePageInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "页面 A".to_string(),
                page_type: None,
                content_markdown: Some("链接 [[页面 B]] 和 [[缺失页]]".to_string()),
                content_json: None,
                content_text: None,
                properties_json: None,
                sort_order: None,
            },
        )
        .unwrap();
        let orphan = KnowledgeService::create_page(
            &db,
            CreateKnowledgePageInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "孤立页".to_string(),
                page_type: None,
                content_markdown: Some("没有链接".to_string()),
                content_json: None,
                content_text: None,
                properties_json: None,
                sort_order: None,
            },
        )
        .unwrap();

        let backlinks = KnowledgeService::list_backlinks(&db, &page_b.node.id).unwrap();
        assert_eq!(backlinks.len(), 1);
        assert_eq!(backlinks[0].source_id, page_a.node.id);

        let links = KnowledgeService::list_page_links(&db, &page_a.node.id).unwrap();
        assert!(links
            .iter()
            .any(|link| link.target_id.as_deref() == Some(page_b.node.id.as_str())));
        assert!(links
            .iter()
            .any(|link| link.target_url.as_deref() == Some("缺失页")));

        let tag = KnowledgeService::create_tag(
            &db,
            CreateKnowledgeTagInput {
                library_id: None,
                name: "项目".to_string(),
                color: Some("#22c55e".to_string()),
            },
        )
        .unwrap();
        KnowledgeService::bind_tag(
            &db,
            BindKnowledgeTagInput {
                tag_id: Some(tag.id.clone()),
                name: None,
                color: None,
                target_type: "page".to_string(),
                target_id: page_a.node.id.clone(),
            },
        )
        .unwrap();
        let page_tags = KnowledgeService::list_tags(
            &db,
            Some(ListKnowledgeTagsInput {
                library_id: None,
                target_type: Some("page".to_string()),
                target_id: Some(page_a.node.id.clone()),
            }),
        )
        .unwrap();
        assert_eq!(page_tags[0].name, "项目");
        let asset = KnowledgeService::create_asset(
            &db,
            CreateKnowledgeAssetInput {
                library_id: None,
                hash: "v09-asset-hash".to_string(),
                original_name: "v09-asset.png".to_string(),
                mime_type: Some("image/png".to_string()),
                extension: Some(".png".to_string()),
                size_bytes: 1024,
                storage_path: "D:/assets/v09-asset.png".to_string(),
                original_path: None,
                preview_path: None,
                thumbnail_path: None,
                extracted_text: Some("附件资料".to_string()),
                metadata_json: None,
                import_status: Some("ready".to_string()),
            },
        )
        .unwrap();
        KnowledgeService::bind_tag(
            &db,
            BindKnowledgeTagInput {
                tag_id: Some(tag.id.clone()),
                name: None,
                color: None,
                target_type: "asset".to_string(),
                target_id: asset.id.clone(),
            },
        )
        .unwrap();
        let asset_tags = KnowledgeService::list_tags(
            &db,
            Some(ListKnowledgeTagsInput {
                library_id: None,
                target_type: Some("asset".to_string()),
                target_id: Some(asset.id.clone()),
            }),
        )
        .unwrap();
        assert_eq!(asset_tags[0].name, "项目");
        let targets = KnowledgeService::list_tag_targets(
            &db,
            ListKnowledgeTagTargetsInput {
                tag_id: tag.id.clone(),
                target_type: None,
                limit: None,
            },
        )
        .unwrap();
        assert!(targets
            .iter()
            .any(|target| target.target_id == page_a.node.id));
        assert!(targets.iter().any(|target| target.target_id == asset.id));

        let todo = TodoService::create_todo(
            &db,
            CreateTodoInput {
                id: "todo-knowledge-source".to_string(),
                list_id: "default-tasks".to_string(),
                title: "知识库来源 Todo".to_string(),
                note: None,
                is_important: None,
                is_my_day: None,
                due_date: None,
                repeat_rule: None,
                sort_order: None,
            },
        )
        .unwrap();
        KnowledgeService::link_todo_source(
            &db,
            LinkKnowledgeTodoInput {
                page_id: page_a.node.id.clone(),
                todo_id: todo.id.clone(),
            },
        )
        .unwrap();
        let graph = KnowledgeService::get_graph(
            &db,
            KnowledgeGraphInput {
                library_id: None,
                space_id: None,
                tag_id: Some(tag.id.clone()),
                limit: Some(200),
            },
        )
        .unwrap();
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == format!("page:{}", page_a.node.id)));
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == format!("asset:{}", asset.id)));
        assert!(graph
            .nodes
            .iter()
            .any(|node| node.id == format!("todo:{}", todo.id)));
        assert!(graph.edges.iter().any(|edge| edge.link_type == "todo"));

        let orphans = KnowledgeService::list_orphan_pages(
            &db,
            Some(ListKnowledgeOrphanPagesInput {
                library_id: None,
                space_id: None,
                limit: Some(20),
            }),
        )
        .unwrap();
        assert!(orphans.iter().any(|page| page.id == orphan.node.id));
        assert!(!orphans.iter().any(|page| page.id == page_a.node.id));
        assert!(!orphans.iter().any(|page| page.id == page_b.node.id));
    }

    #[test]
    fn test_wikilink_ids_stay_stable_when_listing_links_repeatedly() {
        let db = db();
        let target = KnowledgeService::create_page(
            &db,
            CreateKnowledgePageInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "稳定目标".to_string(),
                page_type: None,
                content_markdown: Some("目标页面".to_string()),
                content_json: None,
                content_text: None,
                properties_json: None,
                sort_order: None,
            },
        )
        .unwrap();
        let source = KnowledgeService::create_page(
            &db,
            CreateKnowledgePageInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "稳定来源".to_string(),
                page_type: None,
                content_markdown: Some("[[稳定目标]]".to_string()),
                content_json: None,
                content_text: None,
                properties_json: None,
                sort_order: None,
            },
        )
        .unwrap();

        let first_links = KnowledgeService::list_page_links(&db, &source.node.id).unwrap();
        let first_wikilink = first_links
            .iter()
            .find(|link| {
                link.link_type == "wikilink"
                    && link.target_id.as_deref() == Some(target.node.id.as_str())
            })
            .unwrap()
            .id
            .clone();
        db.with_connection(|conn| {
            conn.execute(
                "UPDATE knowledge_links SET created_at = '2000-01-01 00:00:00' WHERE id = ?1",
                params![first_wikilink],
            )?;
            Ok(())
        })
        .unwrap();

        let second_links = KnowledgeService::list_page_links(&db, &source.node.id).unwrap();
        let second_wikilinks: Vec<_> = second_links
            .iter()
            .filter(|link| link.link_type == "wikilink")
            .collect();

        assert_eq!(second_wikilinks.len(), 1);
        assert_eq!(second_wikilinks[0].id, first_wikilink);
        assert_eq!(second_wikilinks[0].created_at, "2000-01-01 00:00:00");
    }

    #[test]
    fn test_update_move_archive_and_favorite_page() {
        let db = db();
        let source = KnowledgeService::create_folder(
            &db,
            CreateKnowledgeFolderInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "来源".to_string(),
                icon: None,
                sort_order: Some(1),
            },
        )
        .unwrap();
        let target = KnowledgeService::create_folder(
            &db,
            CreateKnowledgeFolderInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "目标".to_string(),
                icon: None,
                sort_order: Some(2),
            },
        )
        .unwrap();
        let page = KnowledgeService::create_page(
            &db,
            CreateKnowledgePageInput {
                library_id: None,
                space_id: None,
                parent_id: Some(source.id.clone()),
                title: "草稿".to_string(),
                page_type: None,
                content_markdown: None,
                content_json: None,
                content_text: None,
                properties_json: None,
                sort_order: None,
            },
        )
        .unwrap();

        let updated = KnowledgeService::update_page(
            &db,
            &page.node.id,
            UpdateKnowledgePageInput {
                title: Some("正式页面".to_string()),
                content_markdown: Some("正文".to_string()),
                content_json: None,
                content_text: None,
                properties_json: None,
                sort_order: Some(5),
            },
        )
        .unwrap();
        assert_eq!(updated.node.title, "正式页面");
        assert_eq!(updated.page.content_text, "正文");

        let moved = KnowledgeService::move_node(
            &db,
            &page.node.id,
            MoveKnowledgeNodeInput {
                parent_id: Some(target.id.clone()),
                sort_order: Some(3),
            },
        )
        .unwrap();
        assert_eq!(moved.parent_id.as_deref(), Some(target.id.as_str()));

        let favorite = KnowledgeService::toggle_favorite(&db, &page.node.id, true).unwrap();
        assert!(favorite.is_favorite);

        let archived = KnowledgeService::archive_node(&db, &page.node.id).unwrap();
        assert!(archived.is_archived);
    }

    #[test]
    fn test_update_and_delete_node() {
        let db = db();
        let folder = KnowledgeService::create_folder(
            &db,
            CreateKnowledgeFolderInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                title: "待整理".to_string(),
                icon: None,
                sort_order: Some(1),
            },
        )
        .unwrap();

        let renamed = KnowledgeService::update_node(
            &db,
            &folder.id,
            UpdateKnowledgeNodeInput {
                title: Some("已整理".to_string()),
                icon: Some("archive".to_string()),
                sort_order: Some(4),
            },
        )
        .unwrap();
        assert_eq!(renamed.title, "已整理");
        assert_eq!(renamed.icon.as_deref(), Some("archive"));
        assert_eq!(renamed.sort_order, 4);

        KnowledgeService::delete_node(&db, &folder.id).unwrap();
        let tree = KnowledgeService::list_tree(&db, None).unwrap();
        assert!(!tree.iter().any(|node| node.id == folder.id));
    }

    #[test]
    fn test_create_and_get_asset() {
        let db = db();
        let libraries = KnowledgeService::list_libraries(&db).unwrap();
        let asset = KnowledgeService::create_asset(
            &db,
            CreateKnowledgeAssetInput {
                library_id: Some(libraries[0].id.clone()),
                hash: "abc123".to_string(),
                original_name: "image.png".to_string(),
                mime_type: Some("image/png".to_string()),
                extension: Some(".png".to_string()),
                size_bytes: 42,
                storage_path: "D:/assets/image.png".to_string(),
                original_path: None,
                preview_path: None,
                thumbnail_path: None,
                extracted_text: None,
                metadata_json: None,
                import_status: Some("ready".to_string()),
            },
        )
        .unwrap();

        let loaded = KnowledgeService::get_asset_by_id(&db, &asset.id).unwrap();
        assert_eq!(loaded.original_name, "image.png");
        assert_eq!(loaded.mime_type, "image/png");
        assert_eq!(loaded.size_bytes, 42);
        assert_eq!(loaded.import_status, "ready");
    }

    #[test]
    fn test_import_document_indexes_and_deduplicates_asset() {
        let db = db();
        let imported = KnowledgeService::import_document(
            &db,
            ImportKnowledgeDocumentInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                hash: "doc-hash-1".to_string(),
                original_name: "索引测试.md".to_string(),
                mime_type: Some("text/markdown".to_string()),
                extension: Some(".md".to_string()),
                size_bytes: 128,
                storage_path: "D:/knowledge/doc.md".to_string(),
                original_path: Some("D:/source/doc.md".to_string()),
                extracted_text: Some("这是中文搜索正文 with english keyword".to_string()),
                metadata_json: Some(r#"{"extractor":"markdown"}"#.to_string()),
                extraction_status: Some("succeeded".to_string()),
                extraction_error: None,
            },
        )
        .unwrap();

        assert_eq!(imported.document.node.node_type, "page");
        assert_eq!(imported.document.page.page_type, "markdown");
        assert_eq!(imported.document.page.source_asset_id.as_deref(), Some(imported.asset.id.as_str()));
        assert_eq!(imported.index_job.status, "succeeded");
        assert!(!imported.duplicate_asset);

        let results = KnowledgeService::search_knowledge(
            &db,
            KnowledgeSearchInput {
                library_id: None,
                space_id: None,
                query: "中文搜索".to_string(),
                source_type: Some("page".to_string()),
                limit: Some(10),
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_type, "page");
        assert_eq!(results[0].node_id.as_deref(), Some(imported.document.node.id.as_str()));

        let asset_results = KnowledgeService::search_knowledge(
            &db,
            KnowledgeSearchInput {
                library_id: None,
                space_id: None,
                query: "索引测试".to_string(),
                source_type: Some("asset".to_string()),
                limit: Some(10),
            },
        )
        .unwrap();
        assert_eq!(asset_results.len(), 1);
        assert_eq!(
            asset_results[0].asset_id.as_deref(),
            Some(imported.asset.id.as_str())
        );

        let duplicate = KnowledgeService::import_document(
            &db,
            ImportKnowledgeDocumentInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                hash: "doc-hash-1".to_string(),
                original_name: "索引测试副本.md".to_string(),
                mime_type: Some("text/markdown".to_string()),
                extension: Some(".md".to_string()),
                size_bytes: 128,
                storage_path: "D:/knowledge/doc.md".to_string(),
                original_path: Some("D:/source/doc-copy.md".to_string()),
                extracted_text: Some("这是中文搜索正文 with english keyword".to_string()),
                metadata_json: Some(r#"{"extractor":"markdown"}"#.to_string()),
                extraction_status: Some("succeeded".to_string()),
                extraction_error: None,
            },
        )
        .unwrap();
        assert!(duplicate.duplicate_asset);
        assert_eq!(duplicate.asset.id, imported.asset.id);
        assert_eq!(duplicate.document.node.id, imported.document.node.id);

        let jobs = KnowledgeService::list_index_jobs(&db, None).unwrap();
        assert!(jobs.iter().any(|job| job.target_id == imported.asset.id));

        let failed = KnowledgeService::import_document(
            &db,
            ImportKnowledgeDocumentInput {
                library_id: None,
                space_id: None,
                parent_id: None,
                hash: "doc-hash-failed".to_string(),
                original_name: "失败文档.pdf".to_string(),
                mime_type: Some("application/pdf".to_string()),
                extension: Some(".pdf".to_string()),
                size_bytes: 256,
                storage_path: "D:/knowledge/failed.pdf".to_string(),
                original_path: Some("D:/source/failed.pdf".to_string()),
                extracted_text: None,
                metadata_json: Some(r#"{"extractor":"pdf"}"#.to_string()),
                extraction_status: Some("failed".to_string()),
                extraction_error: Some("抽取失败".to_string()),
            },
        )
        .unwrap();
        assert_eq!(failed.index_job.status, "failed");
        let cancelled = KnowledgeService::cancel_index_job(&db, &failed.index_job.id).unwrap();
        assert_eq!(cancelled.status, "cancelled");
        assert_eq!(cancelled.progress, 1.0);
        let loaded_job = KnowledgeService::get_index_job_by_id(&db, &failed.index_job.id).unwrap();
        assert_eq!(loaded_job.status, "cancelled");
    }

    #[test]
    fn test_quick_note_create_search_archive_and_convert_to_page() {
        let db = db();
        let note = KnowledgeService::create_quick_note(
            &db,
            CreateKnowledgeQuickNoteInput {
                library_id: None,
                title: None,
                body: "第一行速记\n后续内容".to_string(),
                tags_json: Some(r#"["inbox","项目"]"#.to_string()),
                color: Some("blue".to_string()),
                is_pinned: Some(true),
            },
        )
        .unwrap();

        assert_eq!(note.node.node_type, "quick_note");
        assert_eq!(
            note.node.parent_id.as_deref(),
            Some(KnowledgeService::DEFAULT_INBOX_NODE_ID)
        );
        assert_eq!(note.quick_note.title, "第一行速记");
        assert!(note.quick_note.is_pinned);

        let searched = KnowledgeService::list_quick_notes(
            &db,
            Some(ListKnowledgeQuickNotesInput {
                library_id: None,
                query: Some("项目".to_string()),
                include_archived: None,
            }),
        )
        .unwrap();
        assert_eq!(searched.len(), 1);

        let page = KnowledgeService::convert_quick_note_to_page(
            &db,
            &note.quick_note.id,
            ConvertKnowledgeQuickNoteToPageInput { title: None },
        )
        .unwrap();
        assert_eq!(page.node.title, note.quick_note.title);
        assert!(page.page.content_markdown.contains("来源：知识库速记"));

        let linked =
            KnowledgeService::link_quick_note_todo(&db, &note.quick_note.id, "todo-1").unwrap();
        assert_eq!(
            linked.quick_note.converted_todo_id.as_deref(),
            Some("todo-1")
        );

        let archived = KnowledgeService::archive_quick_note(&db, &note.quick_note.id).unwrap();
        assert!(archived.node.is_archived);

        let active = KnowledgeService::list_quick_notes(&db, None).unwrap();
        assert!(active.is_empty());
        let archived_list = KnowledgeService::list_quick_notes(
            &db,
            Some(ListKnowledgeQuickNotesInput {
                library_id: None,
                query: None,
                include_archived: Some(true),
            }),
        )
        .unwrap();
        assert_eq!(archived_list.len(), 1);
    }
}
