/**
 * 工作台（平台）集成：调用平台已做好的 /org-picker 组织选择页。
 * 通过新窗口打开，结果经 window.opener.postMessage 回传（type=vigor.org.picker.result）。
 */

const ORG_PICKER_TOKEN = import.meta.env.VITE_WORKBENCH_ORG_PICKER_TOKEN as
  | string
  | undefined;

export interface OrgPickerPerson {
  id: string;
  department: string;
  team: string;
  role: string;
  name: string;
  englishName: string;
}

export interface OrgPickerResult {
  type: string;
  mode: 'single' | 'multi';
  persons: OrgPickerPerson[];
}

/**
 * 打开平台组织选择页。
 * @param mode single=单选 / multi=多选（支持按部门全选/清空）
 * @param title 弹窗标题
 * @returns 选中的人员列表；取消/关闭返回空数组；弹窗被拦截时 reject
 */
export function openOrgPicker(
  mode: 'single' | 'multi' = 'multi',
  title = '选择人员'
): Promise<OrgPickerPerson[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: number | undefined;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (timer !== undefined) window.clearInterval(timer);
    };
    const finish = (persons: OrgPickerPerson[]) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(persons);
    };
    const onMessage = (e: MessageEvent) => {
      const data = e.data as OrgPickerResult | undefined;
      if (data && data.type === 'vigor.org.picker.result') {
        finish(data.persons ?? []);
      }
    };

    window.addEventListener('message', onMessage);

    const qs =
      `mode=${mode}&title=${encodeURIComponent(title)}` +
      (ORG_PICKER_TOKEN ? `&token=${encodeURIComponent(ORG_PICKER_TOKEN)}` : '');
    const win = window.open(`/org-picker?${qs}`, '_blank', 'width=760,height=640');

    if (!win) {
      cleanup();
      reject(new Error('浏览器拦截了弹窗，请允许本站弹窗后重试'));
      return;
    }

    // 兜底：用户直接关闭弹窗（未点确定）时释放监听
    timer = window.setInterval(() => {
      if (win.closed) finish([]);
    }, 400);
  });
}
