// Shown instantly on navigation while the server fetches from the remote DB.
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-cream-dark" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-sand bg-white" />
        ))}
      </div>
      <div className="h-64 rounded-2xl border border-sand bg-white" />
    </div>
  );
}
