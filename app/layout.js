import "./globals.css";

export const metadata = {
  title: "PrecioCR — El precio justo de Costa Rica",
  description: "Compara precios, evalúa ofertas y estima cuánto pagar o vender en Costa Rica."
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
