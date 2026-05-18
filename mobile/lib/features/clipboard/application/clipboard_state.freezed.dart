// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'clipboard_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$ClipboardUiState {

 List<MultiDeviceClipboardItem> get items; List<MultiDeviceClipboardDevice> get devices; List<MultiDeviceClipboardDiscoveredDevice> get discoveredDevices; List<MultiDeviceClipboardDeviceStatus> get deviceStatuses; List<MultiDeviceClipboardPairingRequest> get pairingRequests; MultiDeviceClipboardDevice? get localDevice; ClipboardContentFilter get filter; String get query; bool get syncEnabled; bool get backgroundSyncEnabled; bool get syncRunning; int get historyLimit; int get maxSyncBytes; String get deviceName; String? get error;
/// Create a copy of ClipboardUiState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ClipboardUiStateCopyWith<ClipboardUiState> get copyWith => _$ClipboardUiStateCopyWithImpl<ClipboardUiState>(this as ClipboardUiState, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ClipboardUiState&&const DeepCollectionEquality().equals(other.items, items)&&const DeepCollectionEquality().equals(other.devices, devices)&&const DeepCollectionEquality().equals(other.discoveredDevices, discoveredDevices)&&const DeepCollectionEquality().equals(other.deviceStatuses, deviceStatuses)&&const DeepCollectionEquality().equals(other.pairingRequests, pairingRequests)&&(identical(other.localDevice, localDevice) || other.localDevice == localDevice)&&(identical(other.filter, filter) || other.filter == filter)&&(identical(other.query, query) || other.query == query)&&(identical(other.syncEnabled, syncEnabled) || other.syncEnabled == syncEnabled)&&(identical(other.backgroundSyncEnabled, backgroundSyncEnabled) || other.backgroundSyncEnabled == backgroundSyncEnabled)&&(identical(other.syncRunning, syncRunning) || other.syncRunning == syncRunning)&&(identical(other.historyLimit, historyLimit) || other.historyLimit == historyLimit)&&(identical(other.maxSyncBytes, maxSyncBytes) || other.maxSyncBytes == maxSyncBytes)&&(identical(other.deviceName, deviceName) || other.deviceName == deviceName)&&(identical(other.error, error) || other.error == error));
}


@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(items),const DeepCollectionEquality().hash(devices),const DeepCollectionEquality().hash(discoveredDevices),const DeepCollectionEquality().hash(deviceStatuses),const DeepCollectionEquality().hash(pairingRequests),localDevice,filter,query,syncEnabled,backgroundSyncEnabled,syncRunning,historyLimit,maxSyncBytes,deviceName,error);

@override
String toString() {
  return 'ClipboardUiState(items: $items, devices: $devices, discoveredDevices: $discoveredDevices, deviceStatuses: $deviceStatuses, pairingRequests: $pairingRequests, localDevice: $localDevice, filter: $filter, query: $query, syncEnabled: $syncEnabled, backgroundSyncEnabled: $backgroundSyncEnabled, syncRunning: $syncRunning, historyLimit: $historyLimit, maxSyncBytes: $maxSyncBytes, deviceName: $deviceName, error: $error)';
}


}

/// @nodoc
abstract mixin class $ClipboardUiStateCopyWith<$Res>  {
  factory $ClipboardUiStateCopyWith(ClipboardUiState value, $Res Function(ClipboardUiState) _then) = _$ClipboardUiStateCopyWithImpl;
@useResult
$Res call({
 List<MultiDeviceClipboardItem> items, List<MultiDeviceClipboardDevice> devices, List<MultiDeviceClipboardDiscoveredDevice> discoveredDevices, List<MultiDeviceClipboardDeviceStatus> deviceStatuses, List<MultiDeviceClipboardPairingRequest> pairingRequests, MultiDeviceClipboardDevice? localDevice, ClipboardContentFilter filter, String query, bool syncEnabled, bool backgroundSyncEnabled, bool syncRunning, int historyLimit, int maxSyncBytes, String deviceName, String? error
});




}
/// @nodoc
class _$ClipboardUiStateCopyWithImpl<$Res>
    implements $ClipboardUiStateCopyWith<$Res> {
  _$ClipboardUiStateCopyWithImpl(this._self, this._then);

  final ClipboardUiState _self;
  final $Res Function(ClipboardUiState) _then;

/// Create a copy of ClipboardUiState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? items = null,Object? devices = null,Object? discoveredDevices = null,Object? deviceStatuses = null,Object? pairingRequests = null,Object? localDevice = freezed,Object? filter = null,Object? query = null,Object? syncEnabled = null,Object? backgroundSyncEnabled = null,Object? syncRunning = null,Object? historyLimit = null,Object? maxSyncBytes = null,Object? deviceName = null,Object? error = freezed,}) {
  return _then(_self.copyWith(
items: null == items ? _self.items : items // ignore: cast_nullable_to_non_nullable
as List<MultiDeviceClipboardItem>,devices: null == devices ? _self.devices : devices // ignore: cast_nullable_to_non_nullable
as List<MultiDeviceClipboardDevice>,discoveredDevices: null == discoveredDevices ? _self.discoveredDevices : discoveredDevices // ignore: cast_nullable_to_non_nullable
as List<MultiDeviceClipboardDiscoveredDevice>,deviceStatuses: null == deviceStatuses ? _self.deviceStatuses : deviceStatuses // ignore: cast_nullable_to_non_nullable
as List<MultiDeviceClipboardDeviceStatus>,pairingRequests: null == pairingRequests ? _self.pairingRequests : pairingRequests // ignore: cast_nullable_to_non_nullable
as List<MultiDeviceClipboardPairingRequest>,localDevice: freezed == localDevice ? _self.localDevice : localDevice // ignore: cast_nullable_to_non_nullable
as MultiDeviceClipboardDevice?,filter: null == filter ? _self.filter : filter // ignore: cast_nullable_to_non_nullable
as ClipboardContentFilter,query: null == query ? _self.query : query // ignore: cast_nullable_to_non_nullable
as String,syncEnabled: null == syncEnabled ? _self.syncEnabled : syncEnabled // ignore: cast_nullable_to_non_nullable
as bool,backgroundSyncEnabled: null == backgroundSyncEnabled ? _self.backgroundSyncEnabled : backgroundSyncEnabled // ignore: cast_nullable_to_non_nullable
as bool,syncRunning: null == syncRunning ? _self.syncRunning : syncRunning // ignore: cast_nullable_to_non_nullable
as bool,historyLimit: null == historyLimit ? _self.historyLimit : historyLimit // ignore: cast_nullable_to_non_nullable
as int,maxSyncBytes: null == maxSyncBytes ? _self.maxSyncBytes : maxSyncBytes // ignore: cast_nullable_to_non_nullable
as int,deviceName: null == deviceName ? _self.deviceName : deviceName // ignore: cast_nullable_to_non_nullable
as String,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [ClipboardUiState].
extension ClipboardUiStatePatterns on ClipboardUiState {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ClipboardUiState value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ClipboardUiState() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ClipboardUiState value)  $default,){
final _that = this;
switch (_that) {
case _ClipboardUiState():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ClipboardUiState value)?  $default,){
final _that = this;
switch (_that) {
case _ClipboardUiState() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<MultiDeviceClipboardItem> items,  List<MultiDeviceClipboardDevice> devices,  List<MultiDeviceClipboardDiscoveredDevice> discoveredDevices,  List<MultiDeviceClipboardDeviceStatus> deviceStatuses,  List<MultiDeviceClipboardPairingRequest> pairingRequests,  MultiDeviceClipboardDevice? localDevice,  ClipboardContentFilter filter,  String query,  bool syncEnabled,  bool backgroundSyncEnabled,  bool syncRunning,  int historyLimit,  int maxSyncBytes,  String deviceName,  String? error)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ClipboardUiState() when $default != null:
return $default(_that.items,_that.devices,_that.discoveredDevices,_that.deviceStatuses,_that.pairingRequests,_that.localDevice,_that.filter,_that.query,_that.syncEnabled,_that.backgroundSyncEnabled,_that.syncRunning,_that.historyLimit,_that.maxSyncBytes,_that.deviceName,_that.error);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<MultiDeviceClipboardItem> items,  List<MultiDeviceClipboardDevice> devices,  List<MultiDeviceClipboardDiscoveredDevice> discoveredDevices,  List<MultiDeviceClipboardDeviceStatus> deviceStatuses,  List<MultiDeviceClipboardPairingRequest> pairingRequests,  MultiDeviceClipboardDevice? localDevice,  ClipboardContentFilter filter,  String query,  bool syncEnabled,  bool backgroundSyncEnabled,  bool syncRunning,  int historyLimit,  int maxSyncBytes,  String deviceName,  String? error)  $default,) {final _that = this;
switch (_that) {
case _ClipboardUiState():
return $default(_that.items,_that.devices,_that.discoveredDevices,_that.deviceStatuses,_that.pairingRequests,_that.localDevice,_that.filter,_that.query,_that.syncEnabled,_that.backgroundSyncEnabled,_that.syncRunning,_that.historyLimit,_that.maxSyncBytes,_that.deviceName,_that.error);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<MultiDeviceClipboardItem> items,  List<MultiDeviceClipboardDevice> devices,  List<MultiDeviceClipboardDiscoveredDevice> discoveredDevices,  List<MultiDeviceClipboardDeviceStatus> deviceStatuses,  List<MultiDeviceClipboardPairingRequest> pairingRequests,  MultiDeviceClipboardDevice? localDevice,  ClipboardContentFilter filter,  String query,  bool syncEnabled,  bool backgroundSyncEnabled,  bool syncRunning,  int historyLimit,  int maxSyncBytes,  String deviceName,  String? error)?  $default,) {final _that = this;
switch (_that) {
case _ClipboardUiState() when $default != null:
return $default(_that.items,_that.devices,_that.discoveredDevices,_that.deviceStatuses,_that.pairingRequests,_that.localDevice,_that.filter,_that.query,_that.syncEnabled,_that.backgroundSyncEnabled,_that.syncRunning,_that.historyLimit,_that.maxSyncBytes,_that.deviceName,_that.error);case _:
  return null;

}
}

}

/// @nodoc


class _ClipboardUiState extends ClipboardUiState {
  const _ClipboardUiState({final  List<MultiDeviceClipboardItem> items = const <MultiDeviceClipboardItem>[], final  List<MultiDeviceClipboardDevice> devices = const <MultiDeviceClipboardDevice>[], final  List<MultiDeviceClipboardDiscoveredDevice> discoveredDevices = const <MultiDeviceClipboardDiscoveredDevice>[], final  List<MultiDeviceClipboardDeviceStatus> deviceStatuses = const <MultiDeviceClipboardDeviceStatus>[], final  List<MultiDeviceClipboardPairingRequest> pairingRequests = const <MultiDeviceClipboardPairingRequest>[], this.localDevice, this.filter = ClipboardContentFilter.all, this.query = '', this.syncEnabled = false, this.backgroundSyncEnabled = false, this.syncRunning = false, this.historyLimit = 200, this.maxSyncBytes = 100 * 1024 * 1024, this.deviceName = '', this.error}): _items = items,_devices = devices,_discoveredDevices = discoveredDevices,_deviceStatuses = deviceStatuses,_pairingRequests = pairingRequests,super._();
  

 final  List<MultiDeviceClipboardItem> _items;
@override@JsonKey() List<MultiDeviceClipboardItem> get items {
  if (_items is EqualUnmodifiableListView) return _items;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_items);
}

 final  List<MultiDeviceClipboardDevice> _devices;
@override@JsonKey() List<MultiDeviceClipboardDevice> get devices {
  if (_devices is EqualUnmodifiableListView) return _devices;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_devices);
}

 final  List<MultiDeviceClipboardDiscoveredDevice> _discoveredDevices;
@override@JsonKey() List<MultiDeviceClipboardDiscoveredDevice> get discoveredDevices {
  if (_discoveredDevices is EqualUnmodifiableListView) return _discoveredDevices;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_discoveredDevices);
}

 final  List<MultiDeviceClipboardDeviceStatus> _deviceStatuses;
@override@JsonKey() List<MultiDeviceClipboardDeviceStatus> get deviceStatuses {
  if (_deviceStatuses is EqualUnmodifiableListView) return _deviceStatuses;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_deviceStatuses);
}

 final  List<MultiDeviceClipboardPairingRequest> _pairingRequests;
@override@JsonKey() List<MultiDeviceClipboardPairingRequest> get pairingRequests {
  if (_pairingRequests is EqualUnmodifiableListView) return _pairingRequests;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_pairingRequests);
}

@override final  MultiDeviceClipboardDevice? localDevice;
@override@JsonKey() final  ClipboardContentFilter filter;
@override@JsonKey() final  String query;
@override@JsonKey() final  bool syncEnabled;
@override@JsonKey() final  bool backgroundSyncEnabled;
@override@JsonKey() final  bool syncRunning;
@override@JsonKey() final  int historyLimit;
@override@JsonKey() final  int maxSyncBytes;
@override@JsonKey() final  String deviceName;
@override final  String? error;

/// Create a copy of ClipboardUiState
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ClipboardUiStateCopyWith<_ClipboardUiState> get copyWith => __$ClipboardUiStateCopyWithImpl<_ClipboardUiState>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ClipboardUiState&&const DeepCollectionEquality().equals(other._items, _items)&&const DeepCollectionEquality().equals(other._devices, _devices)&&const DeepCollectionEquality().equals(other._discoveredDevices, _discoveredDevices)&&const DeepCollectionEquality().equals(other._deviceStatuses, _deviceStatuses)&&const DeepCollectionEquality().equals(other._pairingRequests, _pairingRequests)&&(identical(other.localDevice, localDevice) || other.localDevice == localDevice)&&(identical(other.filter, filter) || other.filter == filter)&&(identical(other.query, query) || other.query == query)&&(identical(other.syncEnabled, syncEnabled) || other.syncEnabled == syncEnabled)&&(identical(other.backgroundSyncEnabled, backgroundSyncEnabled) || other.backgroundSyncEnabled == backgroundSyncEnabled)&&(identical(other.syncRunning, syncRunning) || other.syncRunning == syncRunning)&&(identical(other.historyLimit, historyLimit) || other.historyLimit == historyLimit)&&(identical(other.maxSyncBytes, maxSyncBytes) || other.maxSyncBytes == maxSyncBytes)&&(identical(other.deviceName, deviceName) || other.deviceName == deviceName)&&(identical(other.error, error) || other.error == error));
}


@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_items),const DeepCollectionEquality().hash(_devices),const DeepCollectionEquality().hash(_discoveredDevices),const DeepCollectionEquality().hash(_deviceStatuses),const DeepCollectionEquality().hash(_pairingRequests),localDevice,filter,query,syncEnabled,backgroundSyncEnabled,syncRunning,historyLimit,maxSyncBytes,deviceName,error);

@override
String toString() {
  return 'ClipboardUiState(items: $items, devices: $devices, discoveredDevices: $discoveredDevices, deviceStatuses: $deviceStatuses, pairingRequests: $pairingRequests, localDevice: $localDevice, filter: $filter, query: $query, syncEnabled: $syncEnabled, backgroundSyncEnabled: $backgroundSyncEnabled, syncRunning: $syncRunning, historyLimit: $historyLimit, maxSyncBytes: $maxSyncBytes, deviceName: $deviceName, error: $error)';
}


}

/// @nodoc
abstract mixin class _$ClipboardUiStateCopyWith<$Res> implements $ClipboardUiStateCopyWith<$Res> {
  factory _$ClipboardUiStateCopyWith(_ClipboardUiState value, $Res Function(_ClipboardUiState) _then) = __$ClipboardUiStateCopyWithImpl;
@override @useResult
$Res call({
 List<MultiDeviceClipboardItem> items, List<MultiDeviceClipboardDevice> devices, List<MultiDeviceClipboardDiscoveredDevice> discoveredDevices, List<MultiDeviceClipboardDeviceStatus> deviceStatuses, List<MultiDeviceClipboardPairingRequest> pairingRequests, MultiDeviceClipboardDevice? localDevice, ClipboardContentFilter filter, String query, bool syncEnabled, bool backgroundSyncEnabled, bool syncRunning, int historyLimit, int maxSyncBytes, String deviceName, String? error
});




}
/// @nodoc
class __$ClipboardUiStateCopyWithImpl<$Res>
    implements _$ClipboardUiStateCopyWith<$Res> {
  __$ClipboardUiStateCopyWithImpl(this._self, this._then);

  final _ClipboardUiState _self;
  final $Res Function(_ClipboardUiState) _then;

/// Create a copy of ClipboardUiState
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? items = null,Object? devices = null,Object? discoveredDevices = null,Object? deviceStatuses = null,Object? pairingRequests = null,Object? localDevice = freezed,Object? filter = null,Object? query = null,Object? syncEnabled = null,Object? backgroundSyncEnabled = null,Object? syncRunning = null,Object? historyLimit = null,Object? maxSyncBytes = null,Object? deviceName = null,Object? error = freezed,}) {
  return _then(_ClipboardUiState(
items: null == items ? _self._items : items // ignore: cast_nullable_to_non_nullable
as List<MultiDeviceClipboardItem>,devices: null == devices ? _self._devices : devices // ignore: cast_nullable_to_non_nullable
as List<MultiDeviceClipboardDevice>,discoveredDevices: null == discoveredDevices ? _self._discoveredDevices : discoveredDevices // ignore: cast_nullable_to_non_nullable
as List<MultiDeviceClipboardDiscoveredDevice>,deviceStatuses: null == deviceStatuses ? _self._deviceStatuses : deviceStatuses // ignore: cast_nullable_to_non_nullable
as List<MultiDeviceClipboardDeviceStatus>,pairingRequests: null == pairingRequests ? _self._pairingRequests : pairingRequests // ignore: cast_nullable_to_non_nullable
as List<MultiDeviceClipboardPairingRequest>,localDevice: freezed == localDevice ? _self.localDevice : localDevice // ignore: cast_nullable_to_non_nullable
as MultiDeviceClipboardDevice?,filter: null == filter ? _self.filter : filter // ignore: cast_nullable_to_non_nullable
as ClipboardContentFilter,query: null == query ? _self.query : query // ignore: cast_nullable_to_non_nullable
as String,syncEnabled: null == syncEnabled ? _self.syncEnabled : syncEnabled // ignore: cast_nullable_to_non_nullable
as bool,backgroundSyncEnabled: null == backgroundSyncEnabled ? _self.backgroundSyncEnabled : backgroundSyncEnabled // ignore: cast_nullable_to_non_nullable
as bool,syncRunning: null == syncRunning ? _self.syncRunning : syncRunning // ignore: cast_nullable_to_non_nullable
as bool,historyLimit: null == historyLimit ? _self.historyLimit : historyLimit // ignore: cast_nullable_to_non_nullable
as int,maxSyncBytes: null == maxSyncBytes ? _self.maxSyncBytes : maxSyncBytes // ignore: cast_nullable_to_non_nullable
as int,deviceName: null == deviceName ? _self.deviceName : deviceName // ignore: cast_nullable_to_non_nullable
as String,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
