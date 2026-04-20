import './globals.css';

export const metadata = {
  title: 'ECS Microservices Dashboard',
  description: 'MERN Microservices on AWS ECS — No API Gateway',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
