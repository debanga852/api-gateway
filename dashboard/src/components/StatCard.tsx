interface StatCardProps {
  label:    string;
  value:    string | number;
  sub?:     string;
  color?:   'green' | 'red' | 'yellow' | 'blue' | 'default';
  icon?:    React.ReactNode;
}

const colorMap = {
  green:   'text-emerald-400',
  red:     'text-red-400',
  yellow:  'text-yellow-400',
  blue:    'text-blue-400',
  default: 'text-white',
};

export default function StatCard({ label, value, sub, color = 'default', icon }: StatCardProps) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
        {icon && <span className="text-gray-500">{icon}</span>}
      </div>
      <p className={`mt-2 text-3xl font-bold ${colorMap[color]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
