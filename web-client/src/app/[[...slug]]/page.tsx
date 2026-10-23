import AppClient from "./AppClient";

export function generateStaticParams() {
  return [{ slug: [] }];
}

export default function Page() {
  return <AppClient />;
}
