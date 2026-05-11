import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_colors.dart';
import '../../design_system/design_system.dart';

class TerminalPage extends StatefulWidget {
  const TerminalPage({super.key});

  @override
  State<TerminalPage> createState() => _TerminalPageState();
}

class _TerminalPageState extends State<TerminalPage> {
  final TextEditingController _controller = TextEditingController();
  final List<String> _commands = ['pnpm run dev', 'cargo test'];
  String _activeTab = 'main';

  static const _tabs = ['main', 'desktop', 'logs'];
  static const _quickCommands = ['git status', 'pnpm build', 'clear'];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _runCommand(String command) {
    if (command.trim().isEmpty) return;
    setState(() {
      if (command == 'clear') {
        _commands.clear();
      } else {
        _commands.add(command.trim());
      }
      _controller.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          AppTopBar(
            title: 'GuYanTools',
            onBack: () => Navigator.of(context).pop(),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _PageHeader(),
                  const SizedBox(height: 14),
                  _Tabs(
                    tabs: _tabs,
                    activeTab: _activeTab,
                    onChanged: (tab) => setState(() => _activeTab = tab),
                  ),
                  const SizedBox(height: 14),
                  Expanded(
                    child: _TerminalCard(
                      commands: _commands,
                      controller: _controller,
                      onRun: _runCommand,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PageHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
        const SizedBox(width: 4),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('模拟终端', style: Theme.of(context).textTheme.titleLarge),
            Text(
              'local-shell · zsh',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ],
    );
  }
}

class _Tabs extends StatelessWidget {
  final List<String> tabs;
  final String activeTab;
  final ValueChanged<String> onChanged;

  const _Tabs({
    required this.tabs,
    required this.activeTab,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Row(
      children: tabs.map((tab) {
        final active = tab == activeTab;
        return Padding(
          padding: const EdgeInsets.only(right: 24),
          child: InkWell(
            onTap: () => onChanged(tab),
            child: Container(
              padding: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(
                    color: active ? cs.primary : Colors.transparent,
                    width: 2,
                  ),
                ),
              ),
              child: Text(
                tab,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: active ? cs.primary : cs.onSurfaceVariant,
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _TerminalCard extends StatelessWidget {
  final List<String> commands;
  final TextEditingController controller;
  final ValueChanged<String> onRun;

  const _TerminalCard({
    required this.commands,
    required this.controller,
    required this.onRun,
  });

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: EdgeInsets.zero,
      color: AppColors.terminal,
      child: Column(
        children: [
          _TerminalHeader(commands: commands),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: commands
                  .expand((command) => _outputFor(command))
                  .toList(),
            ),
          ),
          _InputArea(controller: controller, onRun: onRun),
        ],
      ),
    );
  }

  List<Widget> _outputFor(String command) {
    if (command == 'pnpm run dev') {
      return const [
        _Prompt(command: 'pnpm run dev', path: '~'),
        _TerminalLine('> v1.0.0 dev\n> vite', muted: true),
        _TerminalLine('VITE v4.5.0 ready in 320 ms', accent: true),
        _TerminalLine(
          '➜  Local:   http://localhost:5173/\n➜  Network: use --host to expose\n➜  press h to show help',
        ),
        SizedBox(height: 16),
      ];
    }
    if (command == 'cargo test') {
      return const [
        _Prompt(command: 'cargo test', path: '~/project'),
        _TerminalLine(
          'Compiling package v0.1.0\nFinished test [unoptimized + debuginfo] target(s) in 1.24s\nRunning unittests src/main.rs',
        ),
        _TerminalLine(
          'test result: ok. 14 passed; 0 failed; 0 ignored; finished in 0.00s',
          accent: true,
        ),
        SizedBox(height: 16),
      ];
    }
    return [
      _Prompt(command: command, path: '~/project'),
      const _TerminalLine(
        'command queued in simulated mobile shell',
        muted: true,
      ),
      const SizedBox(height: 16),
    ];
  }
}

class _TerminalHeader extends StatelessWidget {
  final List<String> commands;

  const _TerminalHeader({required this.commands});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 42,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: AppColors.inverseSurface.withValues(alpha: 0.55),
        border: Border(
          bottom: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
        ),
      ),
      child: Row(
        children: [
          const _Dot(color: Color(0xFFFF5F57)),
          const SizedBox(width: 6),
          const _Dot(color: Color(0xFFFFBD2E)),
          const SizedBox(width: 6),
          const _Dot(color: Color(0xFF28C840)),
          const Spacer(),
          IconButton(
            tooltip: '复制输出',
            onPressed: () {
              Clipboard.setData(ClipboardData(text: commands.join('\n')));
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(const SnackBar(content: Text('终端输出已复制')));
            },
            icon: const Icon(
              Icons.content_copy,
              color: AppColors.inverseOnSurface,
              size: 17,
            ),
          ),
        ],
      ),
    );
  }
}

class _InputArea extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onRun;

  const _InputArea({required this.controller, required this.onRun});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.inverseSurface.withValues(alpha: 0.35),
        border: Border(
          top: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
        ),
      ),
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _TerminalPageState._quickCommands
                  .map(
                    (command) => ActionChip(
                      label: Text(command),
                      onPressed: () => onRun(command),
                      backgroundColor: AppColors.inverseSurface,
                      side: BorderSide(
                        color: Colors.white.withValues(alpha: 0.12),
                      ),
                      labelStyle: const TextStyle(
                        color: AppColors.inverseOnSurface,
                        fontFamily: 'monospace',
                        fontSize: 12,
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: controller,
            onSubmitted: onRun,
            style: const TextStyle(
              color: AppColors.inverseOnSurface,
              fontFamily: 'monospace',
              fontSize: 13,
            ),
            decoration: InputDecoration(
              hintText: '输入命令...',
              prefixIcon: const Icon(
                Icons.terminal,
                color: AppColors.tertiaryContainer,
                size: 18,
              ),
              suffixIcon: IconButton(
                icon: const Icon(
                  Icons.keyboard_return,
                  color: AppColors.primaryContainer,
                ),
                onPressed: () => onRun(controller.text),
              ),
              fillColor: AppColors.terminal.withValues(alpha: 0.5),
              hintStyle: TextStyle(
                color: AppColors.inverseOnSurface.withValues(alpha: 0.45),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Prompt extends StatelessWidget {
  final String command;
  final String path;

  const _Prompt({required this.command, required this.path});

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(
        style: const TextStyle(
          fontFamily: 'monospace',
          fontSize: 13,
          height: 1.45,
        ),
        children: [
          const TextSpan(
            text: 'user@local ',
            style: TextStyle(color: AppColors.primaryContainer),
          ),
          TextSpan(
            text: '$path ',
            style: const TextStyle(color: AppColors.lightOutlineVariant),
          ),
          const TextSpan(
            text: r'$ ',
            style: TextStyle(color: AppColors.tertiaryContainer),
          ),
          TextSpan(
            text: command,
            style: const TextStyle(color: AppColors.inverseOnSurface),
          ),
        ],
      ),
    );
  }
}

class _TerminalLine extends StatelessWidget {
  final String text;
  final bool accent;
  final bool muted;

  const _TerminalLine(this.text, {this.accent = false, this.muted = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(
        text,
        style: TextStyle(
          color: accent
              ? AppColors.primaryContainer
              : muted
              ? AppColors.lightOutlineVariant
              : AppColors.inverseOnSurface.withValues(alpha: 0.82),
          fontFamily: 'monospace',
          fontSize: 13,
          height: 1.45,
        ),
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  final Color color;

  const _Dot({required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 9,
      height: 9,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}
