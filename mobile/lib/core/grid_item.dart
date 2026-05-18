import 'dart:convert';

import '../bridge/models/home_layout.dart' as bridge;

enum MobileHomeLayoutScope { mobileCompact, mobileExpanded }

extension MobileHomeLayoutScopeX on MobileHomeLayoutScope {
  String get value => switch (this) {
    MobileHomeLayoutScope.mobileCompact => 'mobile_compact',
    MobileHomeLayoutScope.mobileExpanded => 'mobile_expanded',
  };

  int get fixedColumns => switch (this) {
    MobileHomeLayoutScope.mobileCompact => 4,
    MobileHomeLayoutScope.mobileExpanded => 6,
  };
}

class WidgetAction {
  final String type;
  final String? target;
  final String? pluginId;
  final String? pageId;
  final String? commandId;
  final String? url;
  final String? openMode;

  const WidgetAction({
    required this.type,
    this.target,
    this.pluginId,
    this.pageId,
    this.commandId,
    this.url,
    this.openMode,
  });

  factory WidgetAction.fromJson(Map<String, dynamic> json) {
    return WidgetAction(
      type: (json['type'] as String?) ?? 'none',
      target: json['target'] as String?,
      pluginId: json['pluginId'] as String?,
      pageId: json['pageId'] as String?,
      commandId: json['commandId'] as String?,
      url: json['url'] as String?,
      openMode: json['openMode'] as String?,
    );
  }
}

class GridItem {
  final String id;
  final int workspaceId;
  final String categoryId;
  String label;
  final String? icon;
  final WidgetAction? action;
  final String sourceType;
  final String widgetType;
  final String? sizePreset;
  final Map<String, dynamic>? widgetConfig;
  int col;
  int row;
  int colSpan;
  int rowSpan;
  int preferredCol;
  int preferredRow;
  int priority;
  final String color;
  final String? backgroundImage;
  final String? backgroundVideo;
  final String? backgroundStyle;
  bool isDragging;
  bool hidden;
  final String createdAt;
  final String updatedAt;

  GridItem({
    required this.id,
    required this.workspaceId,
    required this.categoryId,
    required this.label,
    required this.icon,
    required this.action,
    required this.sourceType,
    required this.widgetType,
    required this.sizePreset,
    required this.widgetConfig,
    required this.col,
    required this.row,
    required this.colSpan,
    required this.rowSpan,
    required this.preferredCol,
    required this.preferredRow,
    required this.priority,
    required this.color,
    required this.backgroundImage,
    required this.backgroundVideo,
    required this.backgroundStyle,
    required this.hidden,
    required this.createdAt,
    required this.updatedAt,
    this.isDragging = false,
  });

  factory GridItem.fromBridge(bridge.HomeWidget widget) {
    return GridItem(
      id: widget.id,
      workspaceId: widget.workspaceId,
      categoryId: widget.categoryId,
      label: widget.label,
      icon: widget.icon,
      action: _parseAction(widget.action),
      sourceType: widget.sourceType,
      widgetType: widget.widgetType,
      sizePreset: widget.sizePreset,
      widgetConfig: _parseJsonMap(widget.widgetConfig),
      col: widget.col,
      row: widget.row,
      colSpan: widget.colSpan,
      rowSpan: widget.rowSpan,
      preferredCol: widget.preferredCol,
      preferredRow: widget.preferredRow,
      priority: widget.priority,
      color: widget.color,
      backgroundImage: widget.backgroundImage,
      backgroundVideo: widget.backgroundVideo,
      backgroundStyle: widget.backgroundStyle,
      hidden: widget.hidden,
      createdAt: widget.createdAt,
      updatedAt: widget.updatedAt,
    );
  }

  GridItem copy() {
    return GridItem(
      id: id,
      workspaceId: workspaceId,
      categoryId: categoryId,
      label: label,
      icon: icon,
      action: action,
      sourceType: sourceType,
      widgetType: widgetType,
      sizePreset: sizePreset,
      widgetConfig: widgetConfig == null
          ? null
          : Map<String, dynamic>.from(widgetConfig!),
      col: col,
      row: row,
      colSpan: colSpan,
      rowSpan: rowSpan,
      preferredCol: preferredCol,
      preferredRow: preferredRow,
      priority: priority,
      color: color,
      backgroundImage: backgroundImage,
      backgroundVideo: backgroundVideo,
      backgroundStyle: backgroundStyle,
      hidden: hidden,
      createdAt: createdAt,
      updatedAt: updatedAt,
      isDragging: isDragging,
    );
  }

  bridge.SaveMobileHomeWidgetLayoutInput toLayoutInput() {
    return bridge.SaveMobileHomeWidgetLayoutInput(
      widgetId: id,
      col: col,
      row: row,
      colSpan: colSpan,
      rowSpan: rowSpan,
      preferredCol: preferredCol,
      preferredRow: preferredRow,
      priority: priority,
      hidden: hidden,
    );
  }

  static WidgetAction? _parseAction(String? raw) {
    final map = _parseJsonMap(raw);
    if (map == null) {
      return null;
    }
    return WidgetAction.fromJson(map);
  }

  static Map<String, dynamic>? _parseJsonMap(String? raw) {
    if (raw == null || raw.trim().isEmpty) {
      return null;
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      if (decoded is Map) {
        return decoded.map((key, value) => MapEntry(key.toString(), value));
      }
    } catch (_) {
      return null;
    }
    return null;
  }
}

class GridCategory {
  final String id;
  final int workspaceId;
  final String label;
  final String icon;
  final int sortOrder;
  final String? backgroundColor;
  final String? backgroundImage;
  final String? backgroundVideo;
  final String? backgroundStyle;
  final List<GridItem> items;

  const GridCategory({
    required this.id,
    required this.workspaceId,
    required this.label,
    required this.icon,
    required this.sortOrder,
    required this.backgroundColor,
    required this.backgroundImage,
    required this.backgroundVideo,
    required this.backgroundStyle,
    required this.items,
  });

  factory GridCategory.fromBridge(bridge.HomeLayoutCategory category) {
    final items = category.widgets.map(GridItem.fromBridge).toList()
      ..sort((a, b) {
        final priorityCompare = a.priority.compareTo(b.priority);
        if (priorityCompare != 0) {
          return priorityCompare;
        }
        return a.id.compareTo(b.id);
      });
    return GridCategory(
      id: category.id,
      workspaceId: category.workspaceId,
      label: category.label,
      icon: category.icon,
      sortOrder: category.sortOrder,
      backgroundColor: category.backgroundColor,
      backgroundImage: category.backgroundImage,
      backgroundVideo: category.backgroundVideo,
      backgroundStyle: category.backgroundStyle,
      items: items,
    );
  }

  GridCategory copyWith({List<GridItem>? items}) {
    return GridCategory(
      id: id,
      workspaceId: workspaceId,
      label: label,
      icon: icon,
      sortOrder: sortOrder,
      backgroundColor: backgroundColor,
      backgroundImage: backgroundImage,
      backgroundVideo: backgroundVideo,
      backgroundStyle: backgroundStyle,
      items: items ?? this.items.map((item) => item.copy()).toList(),
    );
  }
}
