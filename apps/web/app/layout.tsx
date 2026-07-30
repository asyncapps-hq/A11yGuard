import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'A11yGuard by KhyFee',
  description: 'Automated PR accessibility reviewer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="footer">A11yGuard by KhyFee</footer>
      </body>
    </html>
  )
}
