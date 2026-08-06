/** 岗位人员分配：某岗位可选的候选人员（按系统设置的人员岗位分配过滤）。
 * 若该岗位在设置中已配置人员 → 只返回这些人员（不同岗位不串人）；
 * 若该岗位未配置任何人 → 返回全部候选（兜底，未配置时保持原行为）。 */
export function positionPersonOptions(
  personPositions: Record<string, string[]> | undefined,
  position: string,
  allPersons: string[]
): string[] {
  if (!personPositions) return allPersons;
  const assigned = Object.entries(personPositions)
    .filter(([, positions]) => positions && positions.includes(position))
    .map(([person]) => person);
  return assigned.length > 0 ? assigned : allPersons;
}

/** 可录入合同的销售类岗位（销售姓名必须与岗位挂钩，仅这些岗位可录入合同） */
const SALES_POSITIONS = ['销售人员', '销售主管', '项目管理人员', '销售助理'];

/** 销售姓名候选：按系统设置的人员岗位过滤为销售类岗位人员。
 * 未配置岗位（personPositions 空）→ 返回全部（兜底，保持原行为）。 */
export function salesPersonOptions(
  personPositions: Record<string, string[]> | undefined,
  allPersons: string[]
): string[] {
  if (!personPositions || Object.keys(personPositions).length === 0) return allPersons;
  const sales = Object.entries(personPositions)
    .filter(([, positions]) => positions && positions.some((p) => SALES_POSITIONS.includes(p)))
    .map(([person]) => person);
  return sales.length > 0 ? sales : allPersons;
}
