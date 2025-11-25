目标

* 新增移动端跨平台应用（Flutter），搭起完整应用框架

* 先实现与桌面端一致的网格拖拽交互（按住延时→拖动→吸附到网格→避让碰撞）

关键对齐（与桌面端逻辑对应）

* 网格项模型对齐 desktop/src/renderer/types/grid.d.ts:1-16

  * id, label, col, row, colSpan, rowSpan, color, preferredCol/Row, priority, hidden, isDragging

* 布局计算对齐 desktop/src/renderer/composables/useGridLayout.ts

  * 单元尺寸、列/行数量、水平偏移、clamp、toGridPosition、syncDraggingPosition

* 拖拽流程对齐 desktop/src/renderer/composables/useGridDrag.ts

  * 长按延时（HOLD\_DELAY\_MS）→开始拖拽→更新拖拽位置→释放时吸附与避让

* 碰撞检测与找位对齐 desktop/src/renderer/composables/useGridCollision.ts

  * overlaps、hasCollision、findAvailablePosition（同心半径搜索）、isWithinBounds

目录与架构规划（新增 mobile/）

* mobile/

  * pubspec.yaml（Flutter 项目）

  * lib/

    * core/

      * grid\_item.dart（映射 GridItem）

      * grid\_config.dart（映射 GridConfig：GRID\_GAP、MIN\_UNIT\_SIZE、STORAGE\_KEY、GRID\_PADDING、HOLD\_DELAY\_MS、FIXED\_COLUMNS）

    * features/grid/

      * grid\_layout.dart（unitSize、cellSize、rowNum、colNum、horizontalOffset、clampCoordinate、toGridPosition、syncDraggingPosition、updateUnitSize、isWithinBounds）

      * grid\_collision.dart（overlaps、hasCollision、findAvailablePosition、canPlaceAt、occupySlot）

      * grid\_drag\_controller.dart（pendingDrag、draggingItem、draggingPosition、pointerOffset、beginDrag/stopDragging，延时长按触发）

    * ui/pages/

      * home\_page.dart（网格绘制与拖拽交互，布局基于 LayoutBuilder，渲染 GridItem）

    * state/

      * grid\_store.dart（ChangeNotifier/ValueNotifier 管理网格项与持久化）

拖拽交互设计（Flutter 实现）

* 使用 LongPress 触发拖拽（对应 HOLD\_DELAY\_MS），或 LongPressDraggable/自定义 GestureDetector+Listener

* 拖动过程将手势坐标转换为网格坐标：toGridPosition→clampCoordinate

* 释放时调用 findAvailablePosition，更新 item.col/row，并同步 preferredCol/Row

* 显示拖拽中的反馈视图（feedback）与占位隐藏逻辑（hidden/isDragging）

布局与适配

* FIXED\_COLUMNS 移动端默认使用较小列数（如 4），unitSize 随屏幕宽度计算，保持与 desktop 一致的吸附行为

* horizontalOffset 居中显示网格（对应 useGridLayout.ts:20-33, 69-83）

持久化（可选，后续补）

* 先不引入依赖，预留接口；后续用 shared\_preferences 将每个分类的布局持久化（对齐 useGridPersistence.ts）

Rust 核心库预留（后续迭代）

* 当前核心在 multi\_platform\_core（Cargo.toml；src/main.rs 为发现逻辑）

* 后续将其改造为库 crate 并导出 C ABI 函数（extern "C"），使用 dart:ffi 绑定

  * Android：cargo-ndk 构建 .so，Flutter 通过 FFI 加载

  * iOS：构建静态库 .a 并通过 FFI 绑定

* 暂不在本迭代集成，保证 UI 拖拽先可用

开发步骤

1. 初始化 Flutter 工程至 mobile/
2. 建模 GridItem 与 GridConfig（字段对齐桌面端类型）
3. 实现 grid\_layout 与 grid\_collision（逻辑对齐桌面端）
4. 实现 grid\_drag\_controller（长按延时、拖拽、释放时吸附与避让）
5. 编写 HomePage，渲染网格，联动拖拽控制器与 Store
6. 手动测试：拖拽、碰撞避让、吸附；横竖屏自适应

验收标准

* 应用可启动，HomePage 展示网格

* 长按一定延时开始拖拽，与桌面端交互一致

* 释放后网格项吸附到最近单元并自动避让已有项

* 手机/模拟器在常见分辨率下表现稳定

后续迭代（非本次）

* 接入 Rust 核心发现/通信逻辑；分类与布局持久化；主题与国际化对齐桌面端

