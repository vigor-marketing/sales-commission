/**
 * 按人员提成明细表：每位相关人 × 每笔 × 每个岗位的提成金额 + 个人总计
 * 数据来源：每笔 result.positionTotals（岗位→金额）+ positionPersons（岗位→人）
 * 保证"每一位涉及到成员的提成明细都要呈现出来"——每人都展开到岗位级贡献
 */
import type { CSSProperties } from 'react';
import type { HistoryRecord } from '../../types';
import { fmtMoney } from '../../utils/format';

interface Props {
  records: HistoryRecord[];
}

interface Row {
  person: string;
  planIndex: number;
  position: string;
  amount: number;
}

export default function PersonCommissionTable({ records }: Props) {
  // 行：person × planIndex × position
  const rows: Row[] = [];
  const totalsByPersonPlan = new Map<string, Map<number, number>>(); // person -> planIndex -> ¥
  const totalsByPerson = new Map<string, number>(); // person -> ¥
  const planIndexes: number[] = [];

  for (const r of records) {
    const idx = r.planIndex ?? 1;
    if (!planIndexes.includes(idx)) planIndexes.push(idx);
    const posTotals = r.result?.positionTotals ?? {};
    const posPersons = r.result?.positionPersons ?? r.positionPersons ?? {};
    for (const [pos, amt] of Object.entries(posTotals)) {
      const person = posPersons[pos];
      if (!person) continue;
      rows.push({ person, planIndex: idx, position: pos, amount: amt });
      const pp =
        totalsByPersonPlan.get(person) ?? new Map<number, number>();
      pp.set(idx, Math.round(((pp.get(idx) ?? 0) + amt) * 100) / 100);
      totalsByPersonPlan.set(person, pp);
      totalsByPerson.set(
        person,
        Math.round(((totalsByPerson.get(person) ?? 0) + amt) * 100) / 100
      );
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#9aa3b5', padding: '8px 0' }}>
        暂无按人分配数据（请确认各笔收款已分配岗位人员）
      </div>
    );
  }

  planIndexes.sort((a, b) => a - b);
  const persons = [...new Set(rows.map((r) => r.person))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN')
  );
  const grandTotal = Math.round(
    persons.reduce((s, p) => s + (totalsByPerson.get(p) ?? 0), 0) * 100
  ) / 100;
  const positionsOf = (person: string) => {
    const set = new Set<string>();
    rows.filter((r) => r.person === person).forEach((r) => set.add(r.position));
    return [...set].sort();
  };
  const cellAmount = (person: string, planIndex: number, position: string) =>
    rows
      .filter((r) => r.person === person && r.planIndex === planIndex && r.position === position)
      .reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: '#4a5568',
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        按人员提成明细（{persons.length} 位相关人 × {planIndexes.length} 笔 × 岗位展开）
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {persons.map((person) => {
          const positions = positionsOf(person);
          return (
            <div
              key={person}
              style={{
                padding: '10px 14px',
                background: '#fff',
                border: '1px solid #e8edf7',
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#0052d9',
                  }}
                >
                  {person}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: '#5b6b85',
                  }}
                >
                  涉及岗位：{positions.join(' / ')}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#00a870',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  个人总计 ¥ {fmtMoney(totalsByPerson.get(person) ?? 0)}
                </span>
              </div>
              <div className="table-scroll"><table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>第几笔</th>
                    <th style={thStyle}>岗位</th>
                    <th style={thStyle}>提成金额（¥）</th>
                  </tr>
                </thead>
                <tbody>
                  {planIndexes.flatMap((idx) =>
                    positions.map((pos) => {
                      const amt = cellAmount(person, idx, pos);
                      if (amt === 0) return null;
                      return (
                        <tr key={`${idx}-${pos}`}>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>第{idx}笔</td>
                          <td style={tdStyle}>{pos}</td>
                          <td
                            style={{
                              ...tdStyle,
                              textAlign: 'right',
                              fontWeight: 600,
                              color: '#4a5568',
                            }}
                          >
                            {fmtMoney(amt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                  <tr style={{ background: '#f7f9ff' }}>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'center',
                        fontWeight: 700,
                      }}
                    >
                      合计
                    </td>
                    <td style={tdStyle}></td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontWeight: 800,
                        color: '#0052d9',
                      }}
                    >
                      ¥ {fmtMoney(totalsByPerson.get(person) ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table></div>
            </div>
          );
        })}
        <div
          style={{
            padding: '12px 14px',
            background: '#e8f0ff',
            border: '1px solid #cfe0ff',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0052d9' }}>
            所有相关人总计
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: '#0052d9',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            ¥ {fmtMoney(grandTotal)}
          </span>
          <span style={{ fontSize: 12, color: '#5b6b85' }}>
            （各笔提成之和 = 合同总提成）
          </span>
        </div>
      </div>
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: '6px 10px',
  textAlign: 'center',
  background: '#f2f3f7',
  border: '1px solid #e3e6ee',
  whiteSpace: 'nowrap',
};
const tdStyle: CSSProperties = {
  padding: '5px 10px',
  border: '1px solid #eef0f5',
  whiteSpace: 'nowrap',
};
