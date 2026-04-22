import 'package:flutter/foundation.dart';
import '../core/models/todo_model.dart';
import '../core/database/database_helper.dart';

class TodoStore extends ChangeNotifier {
  List<TodoItem> _items = [];
  List<TodoItem> get items => _items;
  List<TodoItem> get activeItems => _items.where((e) => !e.done).toList();
  List<TodoItem> get doneItems => _items.where((e) => e.done).toList();
  int get doneCount => doneItems.length;
  int get totalCount => _items.length;

  Future<void> loadFromDb() async {
    final db = await DatabaseHelper.database;
    final maps = await db.query('todos', orderBy: 'createdAt DESC');
    _items = maps.map(TodoItem.fromMap).toList();
    notifyListeners();
  }

  Future<void> addItem(TodoItem item) async {
    _items.insert(0, item);
    notifyListeners();
    final db = await DatabaseHelper.database;
    await db.insert('todos', item.toMap());
  }

  Future<void> toggleDone(String id) async {
    final idx = _items.indexWhere((e) => e.id == id);
    if (idx >= 0) {
      _items[idx].done = !_items[idx].done;
      notifyListeners();
      final db = await DatabaseHelper.database;
      await db.update('todos', {'done': _items[idx].done ? 1 : 0},
          where: 'id = ?', whereArgs: [id]);
    }
  }

  Future<void> removeItem(String id) async {
    _items.removeWhere((e) => e.id == id);
    notifyListeners();
    final db = await DatabaseHelper.database;
    await db.delete('todos', where: 'id = ?', whereArgs: [id]);
  }

  /// 初始化模拟数据（仅在数据库为空时）
  Future<void> seedIfEmpty() async {
    final db = await DatabaseHelper.database;
    final count = (await db.rawQuery('SELECT COUNT(*) as c FROM todos')).first['c'] as int;
    if (count > 0) return;

    final samples = [
      TodoItem(id: '1', title: '审查站点结构完整性报告', priority: TodoPriority.high, dueTime: '09:30 AM'),
      TodoItem(id: '2', title: '与主开发者晨会同步', done: true, priority: TodoPriority.medium),
      TodoItem(id: '3', title: '更新 UI 设计系统文档', priority: TodoPriority.medium, dueTime: '02:00 PM'),
      TodoItem(id: '4', title: '研究毛玻璃性能优化', priority: TodoPriority.low, hasAttachment: true),
      TodoItem(id: '5', title: '编写单元测试', priority: TodoPriority.medium, dueTime: '04:00 PM'),
      TodoItem(id: '6', title: '代码审查 PR #42', priority: TodoPriority.high, dueTime: '11:00 AM'),
    ];

    for (final item in samples) {
      await db.insert('todos', item.toMap());
    }
    _items = samples;
    notifyListeners();
  }
}
