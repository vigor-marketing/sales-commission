/**
 * 工作台（平台）集成：读取组织架构人员目录。
 * 通过 X-Picker-Token 访问工作台 BFF（/api/org/*），无需工作台会话。
 */

const ORG_PICKER_TOKEN = import.meta.env.VITE_WORKBENCH_ORG_PICKER_TOKEN as
  | string
  | undefined;

export interface WorkbenchOrgPerson {
  id: string;
  role: string;
  name: string;
  englishName: string;
  department: string;
  team: string;
}

/** 拉取工作台组织架构的全部人员（扁平列表，含部门/团队） */
export async function getWorkbenchOrgPersons(): Promise<WorkbenchOrgPerson[]> {
  const res = await fetch('/api/org/persons', {
    headers: ORG_PICKER_TOKEN ? { 'X-Picker-Token': ORG_PICKER_TOKEN } : {},
  });
  if (!res.ok) {
    throw new Error(`获取工作台人员失败（${res.status}）`);
  }
  return (await res.json()) as WorkbenchOrgPerson[];
}
