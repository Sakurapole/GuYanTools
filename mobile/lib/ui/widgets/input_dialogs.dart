import 'package:flutter/material.dart';

class AetherTextInputDialog extends StatefulWidget {
  final String title;
  final String initialValue;
  final String confirmLabel;
  final int minLines;
  final int maxLines;
  final TextInputType? keyboardType;
  final String? hintText;
  final String? Function(String value)? normalize;

  const AetherTextInputDialog({
    super.key,
    required this.title,
    this.initialValue = '',
    this.confirmLabel = '保存',
    this.minLines = 1,
    this.maxLines = 1,
    this.keyboardType,
    this.hintText,
    this.normalize,
  });

  @override
  State<AetherTextInputDialog> createState() => _AetherTextInputDialogState();
}

class _AetherTextInputDialogState extends State<AetherTextInputDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        minLines: widget.minLines,
        maxLines: widget.maxLines,
        keyboardType: widget.keyboardType,
        decoration: widget.hintText == null
            ? null
            : InputDecoration(hintText: widget.hintText),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context, rootNavigator: true).pop(),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () {
            final raw = _controller.text;
            final normalized = widget.normalize?.call(raw) ?? raw;
            Navigator.of(context, rootNavigator: true).pop(normalized);
          },
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}
