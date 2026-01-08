'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TrendsChartProps {
  window?: '90d';
  series: Array<{
    name: string;
    window: '90d';
    data: Array<{ date: string; value: number }>;
  }>;
}

const colors = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00',
  '#0088fe', '#00c49f', '#ffbb28', '#ff8042', '#8884d8'
];

export default function TrendsChart({ window = '90d', series }: TrendsChartProps) {
  // Filter series for current window
  const seriesForWindow = series.filter(s => s.window === window);

  if (seriesForWindow.length === 0 || !seriesForWindow.some(s => s.data.length > 0)) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center border rounded-lg bg-gray-50">
        <p className="text-gray-500">No data available for the selected time window</p>
        <p className="text-xs text-gray-400 mt-2">Try fetching trends data or selecting a different time window</p>
      </div>
    );
  }

  // Get all unique dates
  const allDates = new Set<string>();
  seriesForWindow.forEach(s => {
    s.data.forEach(point => {
      allDates.add(point.date.split('T')[0]);
    });
  });

  const sortedDates = Array.from(allDates).sort();

  // Build chart data
  const chartData: Record<string, any>[] = [];
  sortedDates.forEach(date => {
    const point: Record<string, any> = {
      date: new Date(date).toLocaleDateString(),
      timestamp: date,
    };

    seriesForWindow.forEach(s => {
      const found = s.data.find(p => p.date.split('T')[0] === date);
      point[s.name] = typeof found?.value === 'number' ? found.value : null;
    });

    chartData.push(point);
  });

  if (chartData.length === 0) {
    return (
      <div className="w-full h-96 flex items-center justify-center border rounded-lg bg-gray-50">
        <p className="text-gray-500">No data available for the selected time window</p>
      </div>
    );
  }

  return (
    <div className="w-full h-96 p-2 md:p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            angle={-45}
            textAnchor="end"
            height={80}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            label={{ value: 'Interest (0-100)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          {seriesForWindow.map((s, index) => (
            <Line
              key={`${s.name}-${s.window}`}
              type="monotone"
              dataKey={s.name}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
