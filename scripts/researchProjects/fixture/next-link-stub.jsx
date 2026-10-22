// The one Next primitive the library components use. A plain anchor is enough for a loopback fixture.
export default function Link({ href, children, ...rest }) {
  return <a href={href} {...rest}>{children}</a>
}
