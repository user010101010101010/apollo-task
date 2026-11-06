import type { Metadata } from 'next';
export const metadata: Metadata = {title:'Apollo Task — пространство команды',description:'Знания, проекты и люди. Рабочее пространство Apollo.',icons:{icon:'/apollo-symbol.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ru"><head><link rel="stylesheet" href="/styles.css"/><link rel="stylesheet" href="/apollo.css"/></head><body>{children}</body></html>}
