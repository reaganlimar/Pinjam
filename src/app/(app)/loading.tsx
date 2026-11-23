export default function Loading() {
  return (
    <div className="animate-pulse pt-8" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-[8px] bg-line-soft" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-52 rounded-[12px] bg-line-soft" />
        ))}
      </div>
    </div>
  );
}
