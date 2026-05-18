import 'package:flutter/foundation.dart';
import '../core/models/chat_model.dart';

class ChatStore extends ChangeNotifier {
  final List<ChatMessage> _messages = [];
  List<ChatMessage> get messages => _messages;

  Future<void> loadFromDb() async {
    notifyListeners();
  }

  Future<void> addMessage(ChatMessage msg) async {
    _messages.add(msg);
    notifyListeners();
  }

  /// 模拟 AI 回复
  Future<void> sendAndReply(String userText) async {
    final userMsg = ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      content: userText,
      isUser: true,
      timestamp: DateTime.now(),
    );
    await addMessage(userMsg);

    // 模拟延迟
    await Future.delayed(const Duration(milliseconds: 800));

    final aiMsg = ChatMessage(
      id: (DateTime.now().millisecondsSinceEpoch + 1).toString(),
      content: _mockReply(userText),
      isUser: false,
      timestamp: DateTime.now(),
      suggestions: ['查看详情', '继续对话', '导出笔记'],
    );
    await addMessage(aiMsg);
  }

  String _mockReply(String input) {
    if (input.contains('你好') || input.contains('hello')) {
      return '您好！我是你的 AI 助手。有什么可以帮助你的吗？';
    }
    if (input.contains('设计') || input.contains('UI')) {
      return '我理解你对设计的需求。基于 Lucid Architect 设计语言，我建议使用\n\n'
          '• 毛玻璃面板提升层次感\n'
          '• 渐变色强调关键操作\n'
          '• 留白与深度来引导视觉焦点\n\n'
          '需要我生成具体的设计方案吗？';
    }
    return '收到你的消息："$input"。\n\n我正在分析你的需求，请稍候...';
  }

  Future<void> seedIfEmpty() async {
    if (_messages.isNotEmpty) return;

    final now = DateTime.now();
    final samples = [
      ChatMessage(
        id: 'seed_1',
        content: '你好！我已经完成了新模块化项目的结构蓝图分析。你想让我渲染热效率预测，还是专注于美学分层？',
        isUser: false,
        timestamp: now.subtract(const Duration(minutes: 5)),
      ),
      ChatMessage(
        id: 'seed_2',
        content: '先从美学分层开始吧。我想强调 "Lucid Architect" 的设计语言——大量的透明效果和色调渐变，而非硬边框。',
        isUser: true,
        timestamp: now.subtract(const Duration(minutes: 4)),
      ),
      ChatMessage(
        id: 'seed_3',
        content:
            '明白了。我已经生成了概念视觉稿，展示了玻璃面板如何与黄昏渐变交互。\n\n'
            '关键特性：\n'
            '• 深度层叠的毛玻璃容器\n'
            '• 青色到深蓝的渐变色调\n'
            '• 环境光阴影替代硬投影',
        isUser: false,
        timestamp: now.subtract(const Duration(minutes: 3)),
        suggestions: ['优化细节', '导出 3D 模型', '分享项目'],
      ),
    ];

    _messages
      ..clear()
      ..addAll(samples);
    notifyListeners();
  }
}
