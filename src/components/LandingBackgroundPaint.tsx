const edenMobile = "/backgrounds/eden-mobile.jpg";
const edenIpad = "/backgrounds/eden-ipad.jpg";
const edenDesktop = "/backgrounds/eden-desktop.jpg";

export function LandingBackgroundPaint() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <picture>
        <source media="(min-width: 1024px)" srcSet={edenDesktop} />
        <source media="(min-width: 640px)" srcSet={edenIpad} />
        <img
          src={edenMobile}
          alt=""
          className="absolute inset-0 size-full object-cover object-center"
          draggable={false}
        />
      </picture>
    </div>
  );
}
