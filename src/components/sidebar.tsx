export default function sidebar() {
  return (
    <aside className="w-64 bg-white shadow-lg h-screen p-4 flex flex-col">
      <h2 className="text-lg font-semibold mb-4">Previous Sessions</h2>
      <ul className="space-y-2">
        <li className="p-2 rounded hover:bg-gray-200 cursor-pointer">
          Session 1
        </li>
        <li className="p-2 rounded hover:bg-gray-200 cursor-pointer">
          Session 2
        </li>
      </ul>
      <button className="mt-auto bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700">
        New Session
      </button>
    </aside>
  );
}
