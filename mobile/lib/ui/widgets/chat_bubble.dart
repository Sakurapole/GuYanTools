import 'dart:ui';
import 'package:flutter/material.dart';
import '../../core/models/chat_model.dart';
import '../../core/theme/app_colors.dart';

/// 聊天气泡组件 — AI / User 双模式
class ChatBubble extends StatelessWidget {
  final ChatMessage message;

  const ChatBubble({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final isUser = message.isUser;
    final maxWidth = MediaQuery.of(context).size.width * 0.78;

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: ClipRRect(
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(20),
            topRight: const Radius.circular(20),
            bottomLeft: isUser ? const Radius.circular(20) : Radius.zero,
            bottomRight: isUser ? Radius.zero : const Radius.circular(20),
          ),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              decoration: BoxDecoration(
                color: isUser
                    ? (isDark
                        ? cs.primary.withValues(alpha: 0.15)
                        : cs.primary.withValues(alpha: 0.12))
                    : (isDark
                        ? const Color(0xFF191F31).withValues(alpha: 0.7)
                        : cs.surfaceContainerHigh.withValues(alpha: 0.8)),
                border: Border.all(
                  color: isUser
                      ? cs.primary.withValues(alpha: isDark ? 0.2 : 0.15)
                      : AppColors.ghostBorder(isDark),
                ),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(20),
                  topRight: const Radius.circular(20),
                  bottomLeft: isUser ? const Radius.circular(20) : Radius.zero,
                  bottomRight: isUser ? Radius.zero : const Radius.circular(20),
                ),
              ),
              child: Text(
                message.content,
                style: TextStyle(
                  fontSize: 14,
                  height: 1.6,
                  color: isUser
                      ? (isDark ? Colors.white : cs.onSurface)
                      : cs.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
