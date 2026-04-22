use crate::db::{Database, DbError, DbResult};
use crate::models::{
    CompleteTodoResult, CreateTodoInput, CreateTodoListInput, CreateTodoReminderInput,
    CreateTodoStepInput, Todo, TodoList, TodoReminder, TodoStep, UpdateTodoInput,
    UpdateTodoListInput, UpdateTodoStepInput,
};
use rusqlite::{params, Connection};

pub struct TodoService;

impl TodoService {
    // ==================== 列表 CRUD ====================

    pub fn create_list(db: &Database, input: CreateTodoListInput) -> DbResult<TodoList> {
        db.transaction(|conn| {
            let icon = input.icon.unwrap_or_else(|| "list".to_string());
            let theme_color = input.theme_color.unwrap_or_else(|| "#4A90D9".to_string());
            conn.execute(
                "INSERT INTO todo_lists (id, workspace_id, name, icon, theme_color, sort_order)
                 VALUES (?1, 1, ?2, ?3, ?4, ?5)",
                params![input.id, input.name, icon, theme_color, input.sort_order],
            )?;
            Self::get_list(conn, &input.id)
        })
    }

    pub fn update_list(
        db: &Database,
        list_id: &str,
        input: UpdateTodoListInput,
    ) -> DbResult<TodoList> {
        db.transaction(|conn| {
            let current = Self::get_list(conn, list_id)?;
            let name = input.name.unwrap_or(current.name);
            let icon = input.icon.unwrap_or(current.icon);
            let theme_color = input.theme_color.unwrap_or(current.theme_color);
            let sort_order = input.sort_order.unwrap_or(current.sort_order);

            conn.execute(
                "UPDATE todo_lists SET name = ?1, icon = ?2, theme_color = ?3, sort_order = ?4, updated_at = datetime('now')
                 WHERE id = ?5",
                params![name, icon, theme_color, sort_order, list_id],
            )?;
            Self::get_list(conn, list_id)
        })
    }

    pub fn delete_list(db: &Database, list_id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute("DELETE FROM todo_lists WHERE id = ?1", params![list_id])?;
            Ok(())
        })
    }

    pub fn get_all_lists(db: &Database) -> DbResult<Vec<TodoList>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT l.id, l.workspace_id, l.name, l.icon, l.theme_color, l.sort_order,
                        l.created_at, l.updated_at,
                        (SELECT COUNT(*) FROM todos t WHERE t.list_id = l.id AND t.is_completed = 0) as incomplete_count
                 FROM todo_lists l
                 ORDER BY l.sort_order ASC, l.created_at ASC",
            )?;
            let lists = stmt
                .query_map([], |row| Self::map_list(row))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(lists)
        })
    }

    pub fn reorder_lists(db: &Database, ids: Vec<String>) -> DbResult<()> {
        db.transaction(|conn| {
            for (i, id) in ids.iter().enumerate() {
                conn.execute(
                    "UPDATE todo_lists SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2",
                    params![i as i64, id],
                )?;
            }
            Ok(())
        })
    }

    // ==================== 任务 CRUD ====================

    pub fn create_todo(db: &Database, input: CreateTodoInput) -> DbResult<Todo> {
        db.transaction(|conn| {
            let is_important = input.is_important.unwrap_or(false);
            let is_my_day = input.is_my_day.unwrap_or(false);
            let sort_order = input.sort_order.unwrap_or(0);
            let note = input.note.unwrap_or_default();

            conn.execute(
                "INSERT INTO todos (id, list_id, title, note, is_important, is_my_day, my_day_date, due_date, repeat_rule, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    input.id,
                    input.list_id,
                    input.title,
                    note,
                    is_important as i64,
                    is_my_day as i64,
                    if is_my_day { Some(Self::today_str()) } else { None },
                    input.due_date,
                    input.repeat_rule,
                    sort_order
                ],
            )?;
            Self::get_todo_full(conn, &input.id)
        })
    }

    pub fn update_todo(db: &Database, todo_id: &str, input: UpdateTodoInput) -> DbResult<Todo> {
        db.transaction(|conn| {
            let current = Self::get_todo_raw(conn, todo_id)?;
            let list_id = input.list_id.unwrap_or(current.list_id);
            let title = input.title.unwrap_or(current.title);
            let note = input.note.unwrap_or(current.note);
            let is_important = input.is_important.unwrap_or(current.is_important);
            let is_my_day = input.is_my_day.unwrap_or(current.is_my_day);
            let my_day_date = if input.is_my_day.is_some() {
                if is_my_day {
                    Some(Self::today_str())
                } else {
                    None
                }
            } else {
                input.my_day_date.or(current.my_day_date)
            };
            let due_date = match input.due_date {
                Some(d) => {
                    if d.is_empty() {
                        None
                    } else {
                        Some(d)
                    }
                }
                None => current.due_date,
            };
            let repeat_rule = match input.repeat_rule {
                Some(r) => {
                    if r.is_empty() {
                        None
                    } else {
                        Some(r)
                    }
                }
                None => current.repeat_rule,
            };
            let sort_order = input.sort_order.unwrap_or(current.sort_order);

            conn.execute(
                "UPDATE todos SET list_id = ?1, title = ?2, note = ?3, is_important = ?4,
                 is_my_day = ?5, my_day_date = ?6, due_date = ?7, repeat_rule = ?8,
                 sort_order = ?9, updated_at = datetime('now')
                 WHERE id = ?10",
                params![
                    list_id,
                    title,
                    note,
                    is_important as i64,
                    is_my_day as i64,
                    my_day_date,
                    due_date,
                    repeat_rule,
                    sort_order,
                    todo_id
                ],
            )?;
            Self::get_todo_full(conn, todo_id)
        })
    }

    pub fn delete_todo(db: &Database, todo_id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute("DELETE FROM todos WHERE id = ?1", params![todo_id])?;
            Ok(())
        })
    }

    pub fn complete_todo(db: &Database, todo_id: &str) -> DbResult<CompleteTodoResult> {
        db.transaction(|conn| {
            conn.execute(
                "UPDATE todos SET is_completed = 1, completed_at = datetime('now'), updated_at = datetime('now')
                 WHERE id = ?1",
                params![todo_id],
            )?;

            let completed_todo = Self::get_todo_full(conn, todo_id)?;
            let mut next_todo = None;

            // 如果有重复规则，生成下一周期任务
            if let Some(ref rule) = completed_todo.repeat_rule {
                if let Some(next_due) = Self::calc_next_due(&completed_todo.due_date, rule) {
                    let new_id = format!("{}-repeat-{}", todo_id, Self::today_str());
                    conn.execute(
                        "INSERT INTO todos (id, list_id, title, note, is_important, is_my_day, due_date, repeat_rule, sort_order)
                         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8)",
                        params![
                            new_id,
                            completed_todo.list_id,
                            completed_todo.title,
                            completed_todo.note,
                            completed_todo.is_important as i64,
                            next_due,
                            rule,
                            completed_todo.sort_order
                        ],
                    )?;
                    // 复制步骤到新任务
                    let steps = Self::get_steps(conn, todo_id)?;
                    for (i, step) in steps.iter().enumerate() {
                        let step_id = format!("{}-step-{}", new_id, i);
                        conn.execute(
                            "INSERT INTO todo_steps (id, todo_id, title, sort_order) VALUES (?1, ?2, ?3, ?4)",
                            params![step_id, new_id, step.title, step.sort_order],
                        )?;
                    }
                    next_todo = Some(Self::get_todo_full(conn, &new_id)?);
                }
            }

            Ok(CompleteTodoResult {
                completed_todo,
                next_todo,
            })
        })
    }

    pub fn uncomplete_todo(db: &Database, todo_id: &str) -> DbResult<Todo> {
        db.transaction(|conn| {
            conn.execute(
                "UPDATE todos SET is_completed = 0, completed_at = NULL, updated_at = datetime('now') WHERE id = ?1",
                params![todo_id],
            )?;
            Self::get_todo_full(conn, todo_id)
        })
    }

    pub fn get_todos_by_list(
        db: &Database,
        list_id: &str,
        include_completed: bool,
    ) -> DbResult<Vec<Todo>> {
        db.with_connection(|conn| {
            let sql = if include_completed {
                "SELECT id FROM todos WHERE list_id = ?1 ORDER BY is_completed ASC, sort_order ASC, created_at ASC"
            } else {
                "SELECT id FROM todos WHERE list_id = ?1 AND is_completed = 0 ORDER BY sort_order ASC, created_at ASC"
            };
            let mut stmt = conn.prepare(sql)?;
            let ids: Vec<String> = stmt
                .query_map(params![list_id], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            let mut todos = Vec::with_capacity(ids.len());
            for id in &ids {
                todos.push(Self::get_todo_full(conn, id)?);
            }
            Ok(todos)
        })
    }

    pub fn search_todos(db: &Database, query: &str) -> DbResult<Vec<Todo>> {
        db.with_connection(|conn| {
            let pattern = format!("%{}%", query);
            let mut stmt = conn.prepare(
                "SELECT id FROM todos WHERE (title LIKE ?1 OR note LIKE ?1) AND is_completed = 0
                 ORDER BY updated_at DESC LIMIT 50",
            )?;
            let ids: Vec<String> = stmt
                .query_map(params![pattern], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            let mut todos = Vec::with_capacity(ids.len());
            for id in &ids {
                todos.push(Self::get_todo_full(conn, id)?);
            }
            Ok(todos)
        })
    }

    pub fn move_todo(db: &Database, todo_id: &str, target_list_id: &str) -> DbResult<Todo> {
        db.transaction(|conn| {
            conn.execute(
                "UPDATE todos SET list_id = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![target_list_id, todo_id],
            )?;
            Self::get_todo_full(conn, todo_id)
        })
    }

    // ==================== 智能列表查询 ====================

    pub fn get_my_day_todos(db: &Database, date: &str) -> DbResult<Vec<Todo>> {
        db.with_connection(|conn| {
            Self::get_todos_by_query(
                conn,
                "SELECT id FROM todos WHERE is_my_day = 1 AND my_day_date = ?1 AND is_completed = 0 ORDER BY sort_order ASC",
                params![date],
            )
        })
    }

    pub fn get_important_todos(db: &Database) -> DbResult<Vec<Todo>> {
        db.with_connection(|conn| {
            Self::get_todos_by_query(
                conn,
                "SELECT id FROM todos WHERE is_important = 1 AND is_completed = 0 ORDER BY updated_at DESC",
                [],
            )
        })
    }

    pub fn get_planned_todos(db: &Database) -> DbResult<Vec<Todo>> {
        db.with_connection(|conn| {
            Self::get_todos_by_query(
                conn,
                "SELECT id FROM todos WHERE due_date IS NOT NULL AND is_completed = 0 ORDER BY due_date ASC",
                [],
            )
        })
    }

    pub fn get_all_todos(db: &Database) -> DbResult<Vec<Todo>> {
        db.with_connection(|conn| {
            Self::get_todos_by_query(
                conn,
                "SELECT id FROM todos WHERE is_completed = 0 ORDER BY updated_at DESC",
                [],
            )
        })
    }

    pub fn get_completed_todos(db: &Database) -> DbResult<Vec<Todo>> {
        db.with_connection(|conn| {
            Self::get_todos_by_query(
                conn,
                "SELECT id FROM todos WHERE is_completed = 1 ORDER BY completed_at DESC LIMIT 100",
                [],
            )
        })
    }

    // ==================== 我的一天 ====================

    pub fn add_to_my_day(db: &Database, todo_id: &str, date: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute(
                "UPDATE todos SET is_my_day = 1, my_day_date = ?1, updated_at = datetime('now') WHERE id = ?2",
                params![date, todo_id],
            )?;
            Ok(())
        })
    }

    pub fn remove_from_my_day(db: &Database, todo_id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute(
                "UPDATE todos SET is_my_day = 0, my_day_date = NULL, updated_at = datetime('now') WHERE id = ?1",
                params![todo_id],
            )?;
            Ok(())
        })
    }

    pub fn get_yesterday_incomplete(db: &Database, today: &str) -> DbResult<Vec<Todo>> {
        db.with_connection(|conn| {
            // 计算昨天的日期字符串
            let yesterday = Self::add_days_to_date(today, -1).unwrap_or_else(|| today.to_string());
            Self::get_todos_by_query(
                conn,
                "SELECT DISTINCT id FROM todos
                 WHERE is_completed = 0
                   AND (
                     (is_my_day = 1 AND my_day_date = ?1)
                     OR (due_date = ?1)
                   )
                 ORDER BY sort_order ASC",
                params![yesterday],
            )
        })
    }

    pub fn get_my_day_suggestions(db: &Database, today: &str) -> DbResult<Vec<Todo>> {
        db.with_connection(|conn| {
            Self::get_todos_by_query(
                conn,
                "SELECT id FROM todos WHERE is_completed = 0 AND is_my_day = 0
                 AND (due_date = ?1 OR is_important = 1)
                 ORDER BY is_important DESC, due_date ASC LIMIT 10",
                params![today],
            )
        })
    }

    // ==================== 步骤 CRUD ====================

    pub fn create_step(db: &Database, input: CreateTodoStepInput) -> DbResult<TodoStep> {
        db.transaction(|conn| {
            let sort_order = input.sort_order.unwrap_or(0);
            conn.execute(
                "INSERT INTO todo_steps (id, todo_id, title, sort_order) VALUES (?1, ?2, ?3, ?4)",
                params![input.id, input.todo_id, input.title, sort_order],
            )?;
            Self::get_step(conn, &input.id)
        })
    }

    pub fn update_step(
        db: &Database,
        step_id: &str,
        input: UpdateTodoStepInput,
    ) -> DbResult<TodoStep> {
        db.transaction(|conn| {
            let current = Self::get_step(conn, step_id)?;
            let title = input.title.unwrap_or(current.title);
            let is_completed = input.is_completed.unwrap_or(current.is_completed);
            let sort_order = input.sort_order.unwrap_or(current.sort_order);

            conn.execute(
                "UPDATE todo_steps SET title = ?1, is_completed = ?2, sort_order = ?3, updated_at = datetime('now') WHERE id = ?4",
                params![title, is_completed as i64, sort_order, step_id],
            )?;
            Self::get_step(conn, step_id)
        })
    }

    pub fn delete_step(db: &Database, step_id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute("DELETE FROM todo_steps WHERE id = ?1", params![step_id])?;
            Ok(())
        })
    }

    pub fn reorder_steps(db: &Database, ids: Vec<String>) -> DbResult<()> {
        db.transaction(|conn| {
            for (i, id) in ids.iter().enumerate() {
                conn.execute(
                    "UPDATE todo_steps SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2",
                    params![i as i64, id],
                )?;
            }
            Ok(())
        })
    }

    // ==================== 提醒 CRUD ====================

    pub fn create_reminder(
        db: &Database,
        input: CreateTodoReminderInput,
    ) -> DbResult<TodoReminder> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO todo_reminders (id, todo_id, remind_at) VALUES (?1, ?2, ?3)",
                params![input.id, input.todo_id, input.remind_at],
            )?;
            Self::get_reminder(conn, &input.id)
        })
    }

    pub fn delete_reminder(db: &Database, reminder_id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute(
                "DELETE FROM todo_reminders WHERE id = ?1",
                params![reminder_id],
            )?;
            Ok(())
        })
    }

    pub fn get_reminders_by_todo(db: &Database, todo_id: &str) -> DbResult<Vec<TodoReminder>> {
        db.with_connection(|conn| Self::get_reminders(conn, todo_id))
    }

    pub fn get_pending_reminders(db: &Database, now: &str) -> DbResult<Vec<TodoReminder>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, todo_id, remind_at, is_sent, created_at FROM todo_reminders
                 WHERE is_sent = 0 AND remind_at <= ?1",
            )?;
            let reminders = stmt
                .query_map(params![now], |row| Self::map_reminder(row))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(reminders)
        })
    }

    pub fn mark_reminder_sent(db: &Database, reminder_id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute(
                "UPDATE todo_reminders SET is_sent = 1 WHERE id = ?1",
                params![reminder_id],
            )?;
            Ok(())
        })
    }

    // ==================== 内部辅助方法 ====================

    fn get_list(conn: &Connection, list_id: &str) -> DbResult<TodoList> {
        conn.query_row(
            "SELECT l.id, l.workspace_id, l.name, l.icon, l.theme_color, l.sort_order,
                    l.created_at, l.updated_at,
                    (SELECT COUNT(*) FROM todos t WHERE t.list_id = l.id AND t.is_completed = 0)
             FROM todo_lists l WHERE l.id = ?1",
            params![list_id],
            |row| Self::map_list(row),
        )
        .map_err(DbError::from)
    }

    fn map_list(row: &rusqlite::Row<'_>) -> rusqlite::Result<TodoList> {
        Ok(TodoList {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            name: row.get(2)?,
            icon: row.get(3)?,
            theme_color: row.get(4)?,
            sort_order: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            incomplete_count: row.get(8)?,
        })
    }

    fn get_todo_raw(conn: &Connection, todo_id: &str) -> DbResult<Todo> {
        conn.query_row(
            "SELECT id, list_id, title, note, is_completed, is_important, is_my_day,
                    my_day_date, due_date, repeat_rule, sort_order, completed_at, created_at, updated_at
             FROM todos WHERE id = ?1",
            params![todo_id],
            |row| Self::map_todo_raw(row),
        )
        .map_err(DbError::from)
    }

    fn get_todo_full(conn: &Connection, todo_id: &str) -> DbResult<Todo> {
        let mut todo = Self::get_todo_raw(conn, todo_id)?;
        todo.steps = Self::get_steps(conn, todo_id)?;
        todo.reminders = Self::get_reminders(conn, todo_id)?;
        Ok(todo)
    }

    fn map_todo_raw(row: &rusqlite::Row<'_>) -> rusqlite::Result<Todo> {
        Ok(Todo {
            id: row.get(0)?,
            list_id: row.get(1)?,
            title: row.get(2)?,
            note: row.get(3)?,
            is_completed: row.get::<_, i64>(4)? != 0,
            is_important: row.get::<_, i64>(5)? != 0,
            is_my_day: row.get::<_, i64>(6)? != 0,
            my_day_date: row.get(7)?,
            due_date: row.get(8)?,
            repeat_rule: row.get(9)?,
            sort_order: row.get(10)?,
            completed_at: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
            steps: Vec::new(),
            reminders: Vec::new(),
        })
    }

    fn get_steps(conn: &Connection, todo_id: &str) -> DbResult<Vec<TodoStep>> {
        let mut stmt = conn.prepare(
            "SELECT id, todo_id, title, is_completed, sort_order, created_at, updated_at
             FROM todo_steps WHERE todo_id = ?1 ORDER BY sort_order ASC",
        )?;
        let steps = stmt
            .query_map(params![todo_id], |row| Self::map_step(row))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(steps)
    }

    fn get_step(conn: &Connection, step_id: &str) -> DbResult<TodoStep> {
        conn.query_row(
            "SELECT id, todo_id, title, is_completed, sort_order, created_at, updated_at
             FROM todo_steps WHERE id = ?1",
            params![step_id],
            |row| Self::map_step(row),
        )
        .map_err(DbError::from)
    }

    fn map_step(row: &rusqlite::Row<'_>) -> rusqlite::Result<TodoStep> {
        Ok(TodoStep {
            id: row.get(0)?,
            todo_id: row.get(1)?,
            title: row.get(2)?,
            is_completed: row.get::<_, i64>(3)? != 0,
            sort_order: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }

    fn get_reminders(conn: &Connection, todo_id: &str) -> DbResult<Vec<TodoReminder>> {
        let mut stmt = conn.prepare(
            "SELECT id, todo_id, remind_at, is_sent, created_at
             FROM todo_reminders WHERE todo_id = ?1 ORDER BY remind_at ASC",
        )?;
        let reminders = stmt
            .query_map(params![todo_id], |row| Self::map_reminder(row))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(reminders)
    }

    fn get_reminder(conn: &Connection, reminder_id: &str) -> DbResult<TodoReminder> {
        conn.query_row(
            "SELECT id, todo_id, remind_at, is_sent, created_at FROM todo_reminders WHERE id = ?1",
            params![reminder_id],
            |row| Self::map_reminder(row),
        )
        .map_err(DbError::from)
    }

    fn map_reminder(row: &rusqlite::Row<'_>) -> rusqlite::Result<TodoReminder> {
        Ok(TodoReminder {
            id: row.get(0)?,
            todo_id: row.get(1)?,
            remind_at: row.get(2)?,
            is_sent: row.get::<_, i64>(3)? != 0,
            created_at: row.get(4)?,
        })
    }

    fn get_todos_by_query<P: rusqlite::Params>(
        conn: &Connection,
        sql: &str,
        params: P,
    ) -> DbResult<Vec<Todo>> {
        let mut stmt = conn.prepare(sql)?;
        let ids: Vec<String> = stmt
            .query_map(params, |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        let mut todos = Vec::with_capacity(ids.len());
        for id in &ids {
            todos.push(Self::get_todo_full(conn, id)?);
        }
        Ok(todos)
    }

    fn today_str() -> String {
        // 使用 SQLite 的 date 函数在 Rust 中，这里用简单的 chrono-free 方式
        // 返回 YYYY-MM-DD 格式的日期字符串
        let now = std::time::SystemTime::now();
        let duration = now
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        let secs = duration.as_secs() as i64;
        // 简单的日期计算（不依赖 chrono crate）
        let days = secs / 86400;
        let y;
        let m;
        let d;
        // 从 Unix epoch (1970-01-01) 计算日期
        let remaining_days = days + 719468; // days from year 0
        let era = if remaining_days >= 0 {
            remaining_days / 146097
        } else {
            (remaining_days - 146096) / 146097
        };
        let doe = (remaining_days - era * 146097) as u32; // day of era
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        y = yoe as i64 + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        d = doy - (153 * mp + 2) / 5 + 1;
        m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = if m <= 2 { y + 1 } else { y };
        format!("{:04}-{:02}-{:02}", y, m, d)
    }

    fn calc_next_due(current_due: &Option<String>, rule: &str) -> Option<String> {
        // 解析重复规则 JSON，计算下一个截止日期
        let due = match current_due {
            Some(d) if !d.is_empty() => d.clone(),
            _ => Self::today_str(),
        };

        // 简单解析 rule JSON: {"type":"daily"} or {"type":"weekly"} etc.
        let days_to_add = if rule.contains("\"daily\"") {
            1
        } else if rule.contains("\"weekday\"") {
            // 简化：总是加 1 天，跳过周末的逻辑可以后续完善
            1
        } else if rule.contains("\"weekly\"") {
            7
        } else if rule.contains("\"monthly\"") {
            30
        } else if rule.contains("\"yearly\"") {
            365
        } else if rule.contains("\"custom\"") {
            // 尝试解析 interval 和 unit
            // {"type":"custom","interval":3,"unit":"day"}
            let interval = Self::extract_json_number(rule, "interval").unwrap_or(1);
            if rule.contains("\"week\"") {
                interval * 7
            } else if rule.contains("\"month\"") {
                interval * 30
            } else {
                interval
            }
        } else {
            return None;
        };

        Self::add_days_to_date(&due, days_to_add)
    }

    fn extract_json_number(json: &str, key: &str) -> Option<i64> {
        let key_pattern = format!("\"{}\":", key);
        if let Some(pos) = json.find(&key_pattern) {
            let after = &json[pos + key_pattern.len()..];
            let trimmed = after.trim();
            let num_str: String = trimmed.chars().take_while(|c| c.is_ascii_digit()).collect();
            num_str.parse().ok()
        } else {
            None
        }
    }

    fn add_days_to_date(date_str: &str, days: i64) -> Option<String> {
        // 解析 YYYY-MM-DD
        let parts: Vec<&str> = date_str.split('-').collect();
        if parts.len() != 3 {
            return None;
        }
        let y: i64 = parts[0].parse().ok()?;
        let m: u32 = parts[1].parse().ok()?;
        let d: u32 = parts[2].parse().ok()?;

        // 转换为天数，加上 days，再转回日期
        let total_days = Self::date_to_days(y, m, d) + days;
        let (ny, nm, nd) = Self::days_to_date(total_days);
        Some(format!("{:04}-{:02}-{:02}", ny, nm, nd))
    }

    fn date_to_days(y: i64, m: u32, d: u32) -> i64 {
        let y = if m <= 2 { y - 1 } else { y };
        let m = if m <= 2 { m + 9 } else { m - 3 } as i64;
        let era = if y >= 0 { y / 400 } else { (y - 399) / 400 };
        let yoe = (y - era * 400) as u32;
        let doy = (153 * m as u32 + 2) / 5 + d - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146097 + doe as i64 - 719468
    }

    fn days_to_date(days: i64) -> (i64, u32, u32) {
        let z = days + 719468;
        let era = if z >= 0 {
            z / 146097
        } else {
            (z - 146096) / 146097
        };
        let doe = (z - era * 146097) as u32;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let y = yoe as i64 + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = if m <= 2 { y + 1 } else { y };
        (y, m, d)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_todo_list_crud() {
        let db = Database::new_in_memory().unwrap();
        let list = TodoService::create_list(
            &db,
            CreateTodoListInput {
                id: "test-list".to_string(),
                name: "测试列表".to_string(),
                icon: None,
                theme_color: None,
                sort_order: 0,
            },
        )
        .unwrap();
        assert_eq!(list.name, "测试列表");
        assert_eq!(list.icon, "list");

        let updated = TodoService::update_list(
            &db,
            "test-list",
            UpdateTodoListInput {
                name: Some("更新列表".to_string()),
                icon: Some("star".to_string()),
                theme_color: None,
                sort_order: None,
            },
        )
        .unwrap();
        assert_eq!(updated.name, "更新列表");
        assert_eq!(updated.icon, "star");

        let all_lists = TodoService::get_all_lists(&db).unwrap();
        // default-tasks + test-list
        assert!(all_lists.len() >= 2);

        TodoService::delete_list(&db, "test-list").unwrap();
        let after_delete = TodoService::get_all_lists(&db).unwrap();
        assert!(after_delete.iter().all(|l| l.id != "test-list"));
    }

    #[test]
    fn test_todo_crud() {
        let db = Database::new_in_memory().unwrap();
        let todo = TodoService::create_todo(
            &db,
            CreateTodoInput {
                id: "todo-1".to_string(),
                list_id: "default-tasks".to_string(),
                title: "测试任务".to_string(),
                note: Some("备注".to_string()),
                is_important: Some(true),
                is_my_day: None,
                due_date: Some("2026-03-25".to_string()),
                repeat_rule: None,
                sort_order: None,
            },
        )
        .unwrap();
        assert_eq!(todo.title, "测试任务");
        assert!(todo.is_important);
        assert!(!todo.is_my_day);

        let updated = TodoService::update_todo(
            &db,
            "todo-1",
            UpdateTodoInput {
                list_id: None,
                title: Some("更新任务".to_string()),
                note: None,
                is_important: None,
                is_my_day: Some(true),
                my_day_date: None,
                due_date: None,
                repeat_rule: None,
                sort_order: None,
            },
        )
        .unwrap();
        assert_eq!(updated.title, "更新任务");
        assert!(updated.is_my_day);

        let result = TodoService::complete_todo(&db, "todo-1").unwrap();
        assert!(result.completed_todo.is_completed);
        assert!(result.next_todo.is_none());

        let uncompleted = TodoService::uncomplete_todo(&db, "todo-1").unwrap();
        assert!(!uncompleted.is_completed);

        TodoService::delete_todo(&db, "todo-1").unwrap();
    }

    #[test]
    fn test_todo_steps() {
        let db = Database::new_in_memory().unwrap();
        TodoService::create_todo(
            &db,
            CreateTodoInput {
                id: "todo-steps".to_string(),
                list_id: "default-tasks".to_string(),
                title: "有步骤的任务".to_string(),
                note: None,
                is_important: None,
                is_my_day: None,
                due_date: None,
                repeat_rule: None,
                sort_order: None,
            },
        )
        .unwrap();

        let step = TodoService::create_step(
            &db,
            CreateTodoStepInput {
                id: "step-1".to_string(),
                todo_id: "todo-steps".to_string(),
                title: "步骤1".to_string(),
                sort_order: Some(0),
            },
        )
        .unwrap();
        assert_eq!(step.title, "步骤1");

        let updated_step = TodoService::update_step(
            &db,
            "step-1",
            UpdateTodoStepInput {
                title: None,
                is_completed: Some(true),
                sort_order: None,
            },
        )
        .unwrap();
        assert!(updated_step.is_completed);

        let todo = TodoService::get_todos_by_list(&db, "default-tasks", false)
            .unwrap()
            .into_iter()
            .find(|t| t.id == "todo-steps")
            .unwrap();
        assert_eq!(todo.steps.len(), 1);

        TodoService::delete_step(&db, "step-1").unwrap();
    }

    #[test]
    fn test_todo_repeat() {
        let db = Database::new_in_memory().unwrap();
        TodoService::create_todo(
            &db,
            CreateTodoInput {
                id: "todo-repeat".to_string(),
                list_id: "default-tasks".to_string(),
                title: "重复任务".to_string(),
                note: None,
                is_important: None,
                is_my_day: None,
                due_date: Some("2026-03-23".to_string()),
                repeat_rule: Some("{\"type\":\"weekly\"}".to_string()),
                sort_order: None,
            },
        )
        .unwrap();

        let result = TodoService::complete_todo(&db, "todo-repeat").unwrap();
        assert!(result.completed_todo.is_completed);
        assert!(result.next_todo.is_some());
        let next = result.next_todo.unwrap();
        assert_eq!(next.due_date, Some("2026-03-30".to_string()));
        assert!(!next.is_completed);
    }

    #[test]
    fn test_search_todos() {
        let db = Database::new_in_memory().unwrap();
        TodoService::create_todo(
            &db,
            CreateTodoInput {
                id: "search-1".to_string(),
                list_id: "default-tasks".to_string(),
                title: "购买牛奶".to_string(),
                note: None,
                is_important: None,
                is_my_day: None,
                due_date: None,
                repeat_rule: None,
                sort_order: None,
            },
        )
        .unwrap();

        let results = TodoService::search_todos(&db, "牛奶").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "购买牛奶");

        let empty = TodoService::search_todos(&db, "不存在").unwrap();
        assert!(empty.is_empty());
    }
}
