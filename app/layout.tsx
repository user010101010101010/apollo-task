import type { Metadata } from 'next';
export const metadata: Metadata = {title:'Apollo Task — пространство креативного агентства',description:'Проекты клиентов, материалы, задачи и согласования. Рабочее пространство креативного агентства.',icons:{icon:'/apollo-symbol.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ru"><head><link rel="stylesheet" href="/styles.css"/><link rel="stylesheet" href="/apollo.css"/></head><body>{children}</body></html>}
