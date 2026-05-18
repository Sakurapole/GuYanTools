class ChatMessage {
  final String id;
  final String content;
  final bool isUser;
  final DateTime timestamp;
  final String? imageUrl;
  final List<String>? suggestions;

  const ChatMessage({
    required this.id,
    required this.content,
    required this.isUser,
    required this.timestamp,
    this.imageUrl,
    this.suggestions,
  });

  Map<String, dynamic> toMap() => {
    'id': id,
    'content': content,
    'isUser': isUser ? 1 : 0,
    'timestamp': timestamp.toIso8601String(),
    'imageUrl': imageUrl,
  };

  factory ChatMessage.fromMap(Map<String, dynamic> map) => ChatMessage(
    id: map['id'] as String,
    content: map['content'] as String,
    isUser: (map['isUser'] as int) == 1,
    timestamp: DateTime.parse(map['timestamp'] as String),
    imageUrl: map['imageUrl'] as String?,
  );
}
