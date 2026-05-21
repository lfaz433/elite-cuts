import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const PerformanceChart = ({ data }: { data: any[] }) => {
  const safeData = (data || []).map(item => ({
    ...item,
    name: String(item.name || ''),
    label: String(item.label || ''),
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={safeData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis dataKey="name" stroke="#a3a3a3" />
        <YAxis stroke="#a3a3a3" />
        <Tooltip 
          contentStyle={{ backgroundColor: '#141414', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '12px' }}
          itemStyle={{ color: '#D4AF37' }}
        />
        <Bar dataKey="total" fill="url(#goldGradient)" radius={[4, 4, 0, 0]} />
        <defs>
          <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="100%" stopColor="#D4AF37" />
          </linearGradient>
        </defs>
      </BarChart>
    </ResponsiveContainer>
  );
};

export const RevenueChart = ({ data }: { data: any[] }) => {
  const safeData = (data || []).map(item => ({
    ...item,
    name: String(item.name || ''),
    label: String(item.label || ''),
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={safeData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis dataKey="name" stroke="#a3a3a3" />
        <YAxis stroke="#a3a3a3" />
        <Tooltip 
          contentStyle={{ backgroundColor: '#141414', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '12px' }}
          itemStyle={{ color: '#D4AF37' }}
        />
        <Line type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={3} dot={{ fill: '#D4AF37', r: 6 }} activeDot={{ r: 8, stroke: '#FFD700', strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};
