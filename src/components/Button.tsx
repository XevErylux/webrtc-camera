import Html from "@kitajs/html";
import { Children } from "@kitajs/html";

export const Button = ({
  children,
  ...props
}: { children?: Children } & JSX.HtmlButtonTag) => (
  <button {...props} class={props.class}>
    {children}
  </button>
);
