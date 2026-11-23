import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function DonationChart({ data }: { data: { month: string; amount: number }[] }) {
  return <><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} accessibilityLayer>
    <defs><linearGradient id="donationFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b83f2c" stopOpacity={0.25} /><stop offset="100%" stopColor="#b83f2c" stopOpacity={0} /></linearGradient></defs>
    <CartesianGrid vertical={false} stroke="#d7d5ce" />
    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#605c53', fontSize: 12 }} />
    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#605c53', fontSize: 12 }} />
    <Tooltip contentStyle={{borderColor:'#d7d5ce',borderRadius:0}} formatter={value => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
    <Area type="monotone" dataKey="amount" stroke="#b83f2c" strokeWidth={3} fill="url(#donationFill)" />
  </AreaChart></ResponsiveContainer><div className="admin-chart-data"><table><caption>近六个月捐赠金额</caption><thead><tr><th>月份</th><th>金额</th></tr></thead><tbody>{data.map(item=><tr key={item.month}><th>{item.month}</th><td>¥{Number(item.amount).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>)}</tbody></table></div></>
}
