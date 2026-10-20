<script setup lang="ts">
import { useRuntimeEnvironmentContext } from '../../composables/runtime-environment-context';
const r = useRuntimeEnvironmentContext();
</script>

<template>
  <gt-card padding="sm" class="runtime-manager__packages">
    <div class="runtime-manager__heading">
      <h3>{{ r.managerLabel }} 包管理</h3>
      <span>{{ r.visiblePackages.length }} / {{ r.packages.length }} 个包</span>
    </div>
    <p v-if="!r.selected" class="runtime-manager__empty">
      选择一个 {{ r.managerLabel }} 环境后查看和管理包。
    </p>
    <p v-else-if="!r.packagesAvailable" class="runtime-manager__empty">
      当前包管理工具不可用，请先安装工具并刷新检测。
    </p>
    <template v-else>
      <div class="runtime-manager__controls">
        <gt-select
          v-if="r.environmentManager === 'conda'"
          aria-label="Conda 包来源"
          :value="r.packageManager"
          :options="r.packageOptions"
          :disabled="r.locked"
          @gt-change="r.changePackageManager(String($event.detail.value))"
        />
        <span v-else class="runtime-manager__package-tool">{{
          r.environmentManager === 'uv' ? 'uv pip' : 'pip'
        }}</span>
        <gt-input
          aria-label="搜索已安装包"
          placeholder="搜索包名或版本"
          :value="r.packageSearch"
          @gt-input="r.packageSearch = String($event.detail.value)"
        />
        <gt-button size="sm" variant="secondary" :disabled="r.locked" @gt-click="r.checkPackages"
          >检查依赖</gt-button
        >
        <gt-button size="sm" variant="secondary" :disabled="r.locked" @gt-click="r.exportPackages"
          >导出依赖文本</gt-button
        >
      </div>
      <div class="runtime-manager__package-table">
        <table>
          <thead>
            <tr>
              <th>包名</th>
              <th>版本</th>
              <th>来源</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in r.visiblePackages" :key="item.name">
              <td>{{ item.name }}</td>
              <td>{{ item.version }}</td>
              <td>{{ item.source }}</td>
              <td>
                <gt-button
                  size="sm"
                  variant="ghost"
                  :disabled="r.locked || !r.writable || item.name === 'python'"
                  @gt-click="r.changePackages('upgrade', item.name)"
                  >升级</gt-button
                >
                <gt-button
                  size="sm"
                  variant="danger"
                  :disabled="
                    r.locked ||
                    !r.writable ||
                    ['python', 'pip', 'setuptools', 'uv'].includes(item.name)
                  "
                  @gt-click="r.changePackages('remove', item.name)"
                  >卸载</gt-button
                >
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!r.visiblePackages.length" class="field-hint">
          没有匹配包。可刷新检测或更换搜索条件。
        </p>
      </div>
      <p v-if="!r.writable" class="field-hint">
        外部环境只读。创建受管环境后可安装、升级和卸载包。
      </p>
      <template v-else>
        <label class="control-field"
          ><span>包名与版本（每行一个）</span
          ><gt-textarea
            aria-label="安装包与版本"
            :value="r.packageSpecs"
            placeholder="numpy==1.26.4&#10;opencv-python-headless==4.10.0.84"
            :disabled="r.locked"
            @gt-input="r.packageSpecs = String($event.detail.value)"
        /></label>
        <div class="runtime-manager__actions">
          <gt-button
            size="sm"
            variant="primary"
            :disabled="r.locked || !r.packageSpecs.trim()"
            @gt-click="r.changePackages('install')"
            >安装指定包</gt-button
          ><gt-button
            size="sm"
            variant="secondary"
            :disabled="r.locked || !r.packageSpecs.trim()"
            @gt-click="r.changePackages('upgrade')"
            >升级指定包</gt-button
          >
        </div>
      </template>
      <gt-textarea
        v-if="r.exportText"
        aria-label="导出的依赖文本"
        :value="r.exportText"
        readonly
        rows="8"
      />
    </template>
  </gt-card>
</template>
