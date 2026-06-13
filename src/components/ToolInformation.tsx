export type ToolInfoSection = {
  title: string;
  description?: string;
  items: string[];
};

export function ToolInformation({ sections }: { sections: ToolInfoSection[] }) {
  return (
    <div className="mt-10 border-t border-border">
      {sections.map((section) => (
        <section key={section.title} className="border-b border-border py-6">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          {section.description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.description}</p>}
          <ul className="mt-4 space-y-3">
            {section.items.map((item) => (
              <li key={item} className="grid grid-cols-[1rem_1fr] gap-2 text-sm leading-6">
                <span aria-hidden="true" className="mt-[0.65rem] size-1 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}