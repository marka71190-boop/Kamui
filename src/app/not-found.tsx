import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100svh",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: "48px 20px",
      }}
    >
      <div>
        <p className="display red" style={{ fontSize: "clamp(96px, 20vw, 220px)" }}>
          404
        </p>
        <p className="lead" style={{ marginTop: 12 }}>
          Такой страницы нет — но экземпляр коллекции ещё можно успеть забрать.
        </p>
        <Link href="/" className="btn" style={{ marginTop: 32 }}>
          На главную
        </Link>
      </div>
    </main>
  );
}
