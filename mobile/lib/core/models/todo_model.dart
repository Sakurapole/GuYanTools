enum TodoPriority { high, medium, low }

class TodoItem {
  final String id;
  String title;
  bool done;
  TodoPriority priority;
  String? dueTime;
  bool hasAttachment;
  DateTime createdAt;

  TodoItem({
    required this.id,
    required this.title,
    this.done = false,
    this.priority = TodoPriority.low,
    this.dueTime,
    this.hasAttachment = false,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  Map<String, dynamic> toMap() => {
    'id': id,
    'title': title,
    'done': done ? 1 : 0,
    'priority': priority.index,
    'dueTime': dueTime,
    'hasAttachment': hasAttachment ? 1 : 0,
    'createdAt': createdAt.toIso8601String(),
  };

  factory TodoItem.fromMap(Map<String, dynamic> map) => TodoItem(
    id: map['id'] as String,
    title: map['title'] as String,
    done: (map['done'] as int) == 1,
    priority: TodoPriority.values[map['priority'] as int],
    dueTime: map['dueTime'] as String?,
    hasAttachment: (map['hasAttachment'] as int) == 1,
    createdAt: DateTime.parse(map['createdAt'] as String),
  );
}
