import 'package:flutter/foundation.dart';
import '../core/grid_item.dart';

class GridStore extends ChangeNotifier {
  final List<GridItem> items = [];

  void setItems(List<GridItem> newItems) {
    items
      ..clear()
      ..addAll(newItems);
    notifyListeners();
  }

  void updateItem(GridItem item) {
    final index = items.indexWhere((e) => e.id == item.id);
    if (index >= 0) {
      items[index] = item;
      notifyListeners();
    }
  }

  List<GridItem> visibleItems() {
    return items.where((e) => !e.hidden).toList();
  }
}
