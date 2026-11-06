import type { Metadata } from 'next';
export const metadata: Metadata = {title:'Apollo Task — пространство компании',description:'Проекты клиентов, материалы, задачи и согласования. Рабочее пространство компании.',icons:{icon:'/apollo-symbol.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ru"><head><link rel="stylesheet" href="/styles.css"/><link rel="stylesheet" href="/apollo.css"/></head><body>{children}</body></html>}
