import Html from "@kitajs/html";
import { Children } from "@kitajs/html";

export const Button = ({
  children,
  ...props
}: Omit<JSX.HtmlButtonTag, "children"> & { children?: Children }) => (
  <button {...props} class={props.class}>
    {children}
  </button>
);
