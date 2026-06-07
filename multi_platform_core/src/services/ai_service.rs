use crate::db::{Database, DbResult};
use crate::models::{
    AiCanvasFile, AiCanvasOperation, AiCanvasVersion, AiCanvasWorkspace, AiChatMessage,
    AiCitation, AiConversation, CreateAiCanvasOperationInput, CreateAiCanvasVersionInput,
    CreateAiCanvasWorkspaceInput, CreateAiCitationInput, CreateAiConversationInput,
    CreateAiMessageInput, UpdateAiCanvasWorkspaceInput, UpdateAiConversationInput,
    UpdateAiMessageInput, UpsertAiCanvasFileInput,
};
use rusqlite::{params, Connection};

pub struct AiService;

impl AiService {
    pub fn create_conversation(
        db: &Database,
        input: CreateAiConversationInput,
    ) -> DbResult<AiConversation> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_chat_conversations (
                    id, title, provider_id, model_id, system_prompt
                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    input.id,
                    input.title,
                    input.provider_id,
                    input.model_id,
                    input.system_prompt
                ],
            )?;
            Self::get_conversation(conn, &input.id)
        })
    }

    pub fn list_conversations(db: &Database) -> DbResult<Vec<AiConversation>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, title, provider_id, model_id, system_prompt, pinned, archived, created_at, updated_at
                 FROM ai_chat_conversations
                 WHERE archived = 0
                 ORDER BY pinned DESC, updated_at DESC, created_at DESC",
            )?;
            let rows = stmt
                .query_map([], Self::map_conversation)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn update_conversation(
        db: &Database,
        id: &str,
        input: UpdateAiConversationInput,
    ) -> DbResult<AiConversation> {
        db.transaction(|conn| {
            let current = Self::get_conversation(conn, id)?;
            conn.execute(
                "UPDATE ai_chat_conversations
                 SET title = ?1,
                     provider_id = ?2,
                     model_id = ?3,
                     system_prompt = ?4,
                     pinned = ?5,
                     archived = ?6,
                     updated_at = datetime('now')
                 WHERE id = ?7",
                params![
                    input.title.unwrap_or(current.title),
                    input.provider_id.unwrap_or(current.provider_id),
                    input.model_id.unwrap_or(current.model_id),
                    input.system_prompt.or(current.system_prompt),
                    input.pinned.unwrap_or(current.pinned) as i64,
                    input.archived.unwrap_or(current.archived) as i64,
                    id,
                ],
            )?;
            Self::get_conversation(conn, id)
        })
    }

    pub fn delete_conversation(db: &Database, id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute(
                "DELETE FROM ai_chat_conversations WHERE id = ?1",
                params![id],
            )?;
            Ok(())
        })
    }

    pub fn list_messages(db: &Database, conversation_id: &str) -> DbResult<Vec<AiChatMessage>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, conversation_id, role, content, status, parent_message_id,
                        model_id, provider_id, token_usage_json, metadata_json, created_at, updated_at
                 FROM ai_chat_messages
                 WHERE conversation_id = ?1
                 ORDER BY created_at ASC, rowid ASC",
            )?;
            let rows = stmt
                .query_map(params![conversation_id], Self::map_message)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn insert_message(db: &Database, input: CreateAiMessageInput) -> DbResult<AiChatMessage> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_chat_messages (
                    id, conversation_id, role, content, status, parent_message_id,
                    model_id, provider_id, token_usage_json, metadata_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    input.id,
                    input.conversation_id,
                    input.role,
                    input.content,
                    input.status,
                    input.parent_message_id,
                    input.model_id,
                    input.provider_id,
                    input.token_usage_json,
                    input.metadata_json,
                ],
            )?;
            conn.execute(
                "UPDATE ai_chat_conversations SET updated_at = datetime('now') WHERE id = ?1",
                params![input.conversation_id],
            )?;
            Self::get_message(conn, &input.id)
        })
    }

    pub fn update_message(
        db: &Database,
        id: &str,
        input: UpdateAiMessageInput,
    ) -> DbResult<AiChatMessage> {
        db.transaction(|conn| {
            let current = Self::get_message(conn, id)?;
            conn.execute(
                "UPDATE ai_chat_messages
                 SET content = ?1,
                     status = ?2,
                     token_usage_json = ?3,
                     metadata_json = ?4,
                     updated_at = datetime('now')
                 WHERE id = ?5",
                params![
                    input.content.unwrap_or(current.content),
                    input.status.unwrap_or(current.status),
                    input.token_usage_json.or(current.token_usage_json),
                    input.metadata_json.or(current.metadata_json),
                    id,
                ],
            )?;
            Self::get_message(conn, id)
        })
    }

    pub fn insert_citation(db: &Database, input: CreateAiCitationInput) -> DbResult<AiCitation> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_message_citations (
                    id, message_id, source_type, title, url, source_id, snippet, metadata_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    input.id,
                    input.message_id,
                    input.source_type,
                    input.title,
                    input.url,
                    input.source_id,
                    input.snippet,
                    input.metadata_json,
                ],
            )?;
            Self::get_citation(conn, &input.id)
        })
    }

    pub fn list_citations(db: &Database, message_id: &str) -> DbResult<Vec<AiCitation>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, message_id, source_type, title, url, source_id, snippet, metadata_json, created_at
                 FROM ai_message_citations
                 WHERE message_id = ?1
                 ORDER BY created_at ASC, rowid ASC",
            )?;
            let rows = stmt
                .query_map(params![message_id], Self::map_citation)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn list_canvas_workspaces(
        db: &Database,
        conversation_id: &str,
    ) -> DbResult<Vec<AiCanvasWorkspace>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, conversation_id, title, mode, active_version_id, created_at, updated_at
                 FROM ai_canvas_workspaces
                 WHERE conversation_id = ?1
                 ORDER BY updated_at DESC, created_at DESC",
            )?;
            let rows = stmt
                .query_map(params![conversation_id], Self::map_canvas_workspace)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn create_canvas_workspace(
        db: &Database,
        input: CreateAiCanvasWorkspaceInput,
    ) -> DbResult<AiCanvasWorkspace> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_canvas_workspaces (
                    id, conversation_id, title, mode
                 ) VALUES (?1, ?2, ?3, ?4)",
                params![input.id, input.conversation_id, input.title, input.mode],
            )?;
            conn.execute(
                "UPDATE ai_chat_conversations SET updated_at = datetime('now') WHERE id = ?1",
                params![input.conversation_id],
            )?;
            Self::get_canvas_workspace(conn, &input.id)
        })
    }

    pub fn update_canvas_workspace(
        db: &Database,
        id: &str,
        input: UpdateAiCanvasWorkspaceInput,
    ) -> DbResult<AiCanvasWorkspace> {
        db.transaction(|conn| {
            let current = Self::get_canvas_workspace(conn, id)?;
            conn.execute(
                "UPDATE ai_canvas_workspaces
                 SET title = ?1,
                     mode = ?2,
                     active_version_id = ?3,
                     updated_at = datetime('now')
                 WHERE id = ?4",
                params![
                    input.title.unwrap_or(current.title),
                    input.mode.unwrap_or(current.mode),
                    input.active_version_id.or(current.active_version_id),
                    id,
                ],
            )?;
            Self::get_canvas_workspace(conn, id)
        })
    }

    pub fn delete_canvas_workspace(db: &Database, id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute("DELETE FROM ai_canvas_workspaces WHERE id = ?1", params![id])?;
            Ok(())
        })
    }

    pub fn list_canvas_files(db: &Database, workspace_id: &str) -> DbResult<Vec<AiCanvasFile>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, path, language, content, created_at, updated_at
                 FROM ai_canvas_files
                 WHERE workspace_id = ?1
                 ORDER BY path ASC",
            )?;
            let rows = stmt
                .query_map(params![workspace_id], Self::map_canvas_file)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn upsert_canvas_file(
        db: &Database,
        input: UpsertAiCanvasFileInput,
    ) -> DbResult<AiCanvasFile> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_canvas_files (
                    id, workspace_id, path, language, content
                 ) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(workspace_id, path) DO UPDATE SET
                    language = excluded.language,
                    content = excluded.content,
                    updated_at = datetime('now')",
                params![
                    input.id,
                    input.workspace_id,
                    input.path,
                    input.language,
                    input.content,
                ],
            )?;
            conn.execute(
                "UPDATE ai_canvas_workspaces SET updated_at = datetime('now') WHERE id = ?1",
                params![input.workspace_id],
            )?;
            Self::get_canvas_file(conn, &input.workspace_id, &input.path)
        })
    }

    pub fn delete_canvas_file(db: &Database, workspace_id: &str, path: &str) -> DbResult<()> {
        db.transaction(|conn| {
            conn.execute(
                "DELETE FROM ai_canvas_files WHERE workspace_id = ?1 AND path = ?2",
                params![workspace_id, path],
            )?;
            conn.execute(
                "UPDATE ai_canvas_workspaces SET updated_at = datetime('now') WHERE id = ?1",
                params![workspace_id],
            )?;
            Ok(())
        })
    }

    pub fn list_canvas_versions(
        db: &Database,
        workspace_id: &str,
    ) -> DbResult<Vec<AiCanvasVersion>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, version_no, snapshot_json, source_message_id, created_at
                 FROM ai_canvas_versions
                 WHERE workspace_id = ?1
                 ORDER BY version_no DESC",
            )?;
            let rows = stmt
                .query_map(params![workspace_id], Self::map_canvas_version)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn create_canvas_version(
        db: &Database,
        input: CreateAiCanvasVersionInput,
    ) -> DbResult<AiCanvasVersion> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_canvas_versions (
                    id, workspace_id, version_no, snapshot_json, source_message_id
                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    input.id,
                    input.workspace_id,
                    input.version_no,
                    input.snapshot_json,
                    input.source_message_id,
                ],
            )?;
            conn.execute(
                "UPDATE ai_canvas_workspaces
                 SET active_version_id = ?1, updated_at = datetime('now')
                 WHERE id = ?2",
                params![input.id, input.workspace_id],
            )?;
            Self::get_canvas_version(conn, &input.id)
        })
    }

    pub fn list_canvas_operations(
        db: &Database,
        workspace_id: &str,
    ) -> DbResult<Vec<AiCanvasOperation>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, workspace_id, source_message_id, operation_type, payload_json, status, created_at
                 FROM ai_canvas_operations
                 WHERE workspace_id = ?1
                 ORDER BY created_at DESC, rowid DESC",
            )?;
            let rows = stmt
                .query_map(params![workspace_id], Self::map_canvas_operation)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn create_canvas_operation(
        db: &Database,
        input: CreateAiCanvasOperationInput,
    ) -> DbResult<AiCanvasOperation> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO ai_canvas_operations (
                    id, workspace_id, source_message_id, operation_type, payload_json, status
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    input.id,
                    input.workspace_id,
                    input.source_message_id,
                    input.operation_type,
                    input.payload_json,
                    input.status,
                ],
            )?;
            conn.execute(
                "UPDATE ai_canvas_workspaces SET updated_at = datetime('now') WHERE id = ?1",
                params![input.workspace_id],
            )?;
            Self::get_canvas_operation(conn, &input.id)
        })
    }

    fn get_conversation(conn: &Connection, id: &str) -> DbResult<AiConversation> {
        conn.query_row(
            "SELECT id, title, provider_id, model_id, system_prompt, pinned, archived, created_at, updated_at
             FROM ai_chat_conversations
             WHERE id = ?1",
            params![id],
            Self::map_conversation,
        )
        .map_err(Into::into)
    }

    fn get_message(conn: &Connection, id: &str) -> DbResult<AiChatMessage> {
        conn.query_row(
            "SELECT id, conversation_id, role, content, status, parent_message_id,
                    model_id, provider_id, token_usage_json, metadata_json, created_at, updated_at
             FROM ai_chat_messages
             WHERE id = ?1",
            params![id],
            Self::map_message,
        )
        .map_err(Into::into)
    }

    fn get_citation(conn: &Connection, id: &str) -> DbResult<AiCitation> {
        conn.query_row(
            "SELECT id, message_id, source_type, title, url, source_id, snippet, metadata_json, created_at
             FROM ai_message_citations
             WHERE id = ?1",
            params![id],
            Self::map_citation,
        )
        .map_err(Into::into)
    }

    fn get_canvas_workspace(conn: &Connection, id: &str) -> DbResult<AiCanvasWorkspace> {
        conn.query_row(
            "SELECT id, conversation_id, title, mode, active_version_id, created_at, updated_at
             FROM ai_canvas_workspaces
             WHERE id = ?1",
            params![id],
            Self::map_canvas_workspace,
        )
        .map_err(Into::into)
    }

    fn get_canvas_file(
        conn: &Connection,
        workspace_id: &str,
        path: &str,
    ) -> DbResult<AiCanvasFile> {
        conn.query_row(
            "SELECT id, workspace_id, path, language, content, created_at, updated_at
             FROM ai_canvas_files
             WHERE workspace_id = ?1 AND path = ?2",
            params![workspace_id, path],
            Self::map_canvas_file,
        )
        .map_err(Into::into)
    }

    fn get_canvas_version(conn: &Connection, id: &str) -> DbResult<AiCanvasVersion> {
        conn.query_row(
            "SELECT id, workspace_id, version_no, snapshot_json, source_message_id, created_at
             FROM ai_canvas_versions
             WHERE id = ?1",
            params![id],
            Self::map_canvas_version,
        )
        .map_err(Into::into)
    }

    fn get_canvas_operation(conn: &Connection, id: &str) -> DbResult<AiCanvasOperation> {
        conn.query_row(
            "SELECT id, workspace_id, source_message_id, operation_type, payload_json, status, created_at
             FROM ai_canvas_operations
             WHERE id = ?1",
            params![id],
            Self::map_canvas_operation,
        )
        .map_err(Into::into)
    }

    fn map_conversation(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiConversation> {
        Ok(AiConversation {
            id: row.get(0)?,
            title: row.get(1)?,
            provider_id: row.get(2)?,
            model_id: row.get(3)?,
            system_prompt: row.get(4)?,
            pinned: row.get::<_, i64>(5)? != 0,
            archived: row.get::<_, i64>(6)? != 0,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }

    fn map_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiChatMessage> {
        Ok(AiChatMessage {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            status: row.get(4)?,
            parent_message_id: row.get(5)?,
            model_id: row.get(6)?,
            provider_id: row.get(7)?,
            token_usage_json: row.get(8)?,
            metadata_json: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }

    fn map_citation(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiCitation> {
        Ok(AiCitation {
            id: row.get(0)?,
            message_id: row.get(1)?,
            source_type: row.get(2)?,
            title: row.get(3)?,
            url: row.get(4)?,
            source_id: row.get(5)?,
            snippet: row.get(6)?,
            metadata_json: row.get(7)?,
            created_at: row.get(8)?,
        })
    }

    fn map_canvas_workspace(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiCanvasWorkspace> {
        Ok(AiCanvasWorkspace {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            title: row.get(2)?,
            mode: row.get(3)?,
            active_version_id: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }

    fn map_canvas_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiCanvasFile> {
        Ok(AiCanvasFile {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            path: row.get(2)?,
            language: row.get(3)?,
            content: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }

    fn map_canvas_version(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiCanvasVersion> {
        Ok(AiCanvasVersion {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            version_no: row.get(2)?,
            snapshot_json: row.get(3)?,
            source_message_id: row.get(4)?,
            created_at: row.get(5)?,
        })
    }

    fn map_canvas_operation(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiCanvasOperation> {
        Ok(AiCanvasOperation {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            source_message_id: row.get(2)?,
            operation_type: row.get(3)?,
            payload_json: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conversation_input(id: &str) -> CreateAiConversationInput {
        CreateAiConversationInput {
            id: id.to_string(),
            title: "New chat".to_string(),
            provider_id: "openai".to_string(),
            model_id: "gpt-test".to_string(),
            system_prompt: None,
        }
    }

    #[test]
    fn creates_conversation_and_messages() {
        let db = Database::new_in_memory().unwrap();
        let conversation =
            AiService::create_conversation(&db, conversation_input("conv-1")).unwrap();
        assert_eq!(conversation.id, "conv-1");

        AiService::insert_message(
            &db,
            CreateAiMessageInput {
                id: "msg-user".to_string(),
                conversation_id: "conv-1".to_string(),
                role: "user".to_string(),
                content: "hello".to_string(),
                status: "complete".to_string(),
                parent_message_id: None,
                model_id: None,
                provider_id: None,
                token_usage_json: None,
                metadata_json: None,
            },
        )
        .unwrap();

        AiService::insert_message(
            &db,
            CreateAiMessageInput {
                id: "msg-assistant".to_string(),
                conversation_id: "conv-1".to_string(),
                role: "assistant".to_string(),
                content: "hi".to_string(),
                status: "complete".to_string(),
                parent_message_id: Some("msg-user".to_string()),
                model_id: Some("gpt-test".to_string()),
                provider_id: Some("openai".to_string()),
                token_usage_json: None,
                metadata_json: None,
            },
        )
        .unwrap();

        let messages = AiService::list_messages(&db, "conv-1").unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }

    #[test]
    fn deleting_conversation_removes_messages() {
        let db = Database::new_in_memory().unwrap();
        AiService::create_conversation(&db, conversation_input("conv-2")).unwrap();
        AiService::insert_message(
            &db,
            CreateAiMessageInput {
                id: "msg-delete".to_string(),
                conversation_id: "conv-2".to_string(),
                role: "user".to_string(),
                content: "delete me".to_string(),
                status: "complete".to_string(),
                parent_message_id: None,
                model_id: None,
                provider_id: None,
                token_usage_json: None,
                metadata_json: None,
            },
        )
        .unwrap();

        AiService::delete_conversation(&db, "conv-2").unwrap();
        let messages = AiService::list_messages(&db, "conv-2").unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn creates_canvas_workspace_files_versions_and_operations() {
        let db = Database::new_in_memory().unwrap();
        AiService::create_conversation(&db, conversation_input("conv-canvas")).unwrap();

        let workspace = AiService::create_canvas_workspace(
            &db,
            CreateAiCanvasWorkspaceInput {
                id: "canvas-1".to_string(),
                conversation_id: "conv-canvas".to_string(),
                title: "Landing page".to_string(),
                mode: "html".to_string(),
            },
        )
        .unwrap();
        assert_eq!(workspace.mode, "html");

        let file = AiService::upsert_canvas_file(
            &db,
            UpsertAiCanvasFileInput {
                id: "file-1".to_string(),
                workspace_id: "canvas-1".to_string(),
                path: "index.html".to_string(),
                language: "html".to_string(),
                content: "<h1>Hello</h1>".to_string(),
            },
        )
        .unwrap();
        assert_eq!(file.path, "index.html");

        let version = AiService::create_canvas_version(
            &db,
            CreateAiCanvasVersionInput {
                id: "version-1".to_string(),
                workspace_id: "canvas-1".to_string(),
                version_no: 1,
                snapshot_json:
                    r#"{"files":[{"path":"index.html","content":"<h1>Hello</h1>"}]}"#
                        .to_string(),
                source_message_id: None,
            },
        )
        .unwrap();
        assert_eq!(version.version_no, 1);

        let operation = AiService::create_canvas_operation(
            &db,
            CreateAiCanvasOperationInput {
                id: "operation-1".to_string(),
                workspace_id: "canvas-1".to_string(),
                source_message_id: None,
                operation_type: "replace_file".to_string(),
                payload_json: r#"{"path":"index.html"}"#.to_string(),
                status: "applied".to_string(),
            },
        )
        .unwrap();
        assert_eq!(operation.status, "applied");

        assert_eq!(
            AiService::list_canvas_workspaces(&db, "conv-canvas")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(AiService::list_canvas_files(&db, "canvas-1").unwrap().len(), 1);
        assert_eq!(
            AiService::list_canvas_versions(&db, "canvas-1")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            AiService::list_canvas_operations(&db, "canvas-1")
                .unwrap()
                .len(),
            1
        );

        AiService::delete_conversation(&db, "conv-canvas").unwrap();
        assert!(
            AiService::list_canvas_workspaces(&db, "conv-canvas")
                .unwrap()
                .is_empty()
        );
    }
}
