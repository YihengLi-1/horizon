export default function Loading() {
  return (
    <div className="campus-page space-y-4">
      {[1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="campus-card h-24 animate-pulse bg-slate-100" />
      ))}
    </div>
  );
}
