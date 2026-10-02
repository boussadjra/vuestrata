#!/bin/sh
# Renders what THIS container's environment decides, before nginx starts.
#
# The image is built once and promoted from one environment to the next, so
# nothing that differs between them may be baked into it. Three things do
# differ, and all three are written here, at start, from the environment:
#
#   runtime-config.js       the values the app reads at load, in place of the
#                           ones inlined when it was built
#   security-headers.conf   the header snippet, its CSP connect-src widened by
#                           the origins the environment names
#   api-location.conf       the JSON 502 for an unrouted same-origin API path,
#                           or nothing when the API is on another origin
#
# The nginx image runs every executable *.sh in /docker-entrypoint.d before it
# starts the server, and stops if one fails. docker/nginx.conf includes the two
# .conf files, so a container this script did not run in does not start either:
# there is no way to serve the app without its headers.
#
# Everything is written under /tmp/vuestrata. nginx-unprivileged already keeps
# its pid and temp files in /tmp, so a writable /tmp is the only thing a
# read-only root filesystem has to grant (a tmpfs, or an emptyDir in a pod).
#
# SECURITY. Every value read below ends up in a JavaScript file, an HTTP header
# or an nginx configuration. A quote would end a string there, `;` a directive,
# `$` would start an nginx variable, and `</script>` or a newline have their own
# uses. So a value is first held to a URL-safe character set (check_value), and
# what reaches the nginx configuration is never the value itself: it is an
# origin or a path rebuilt from the parts that pass a narrower check. A value
# that fails stops the container with a message naming the variable. It is
# never repaired, truncated or skipped: a deployment whose configuration was
# silently altered is worse than one that does not start.
#
# POSIX sh, no bashisms: the image's /bin/sh is BusyBox ash. No value is read
# from the environment through a command substitution, which would drop a
# trailing newline before it could be rejected.
#
# Usage: 40-vuestrata-runtime.sh [SOURCE_DIR [OUTPUT_DIR]]
# The arguments exist for the tests. nginx's entrypoint passes none.

set -eu

# Byte-wise pattern matching: a range such as A-Z must mean ASCII, whatever
# locale the container was given.
LC_ALL=C
export LC_ALL

ME=40-vuestrata-runtime.sh
SOURCE_DIR=${1:-/etc/vuestrata/runtime}
OUTPUT_DIR=${2:-/tmp/vuestrata}

KEYS=$SOURCE_DIR/keys
HEADERS_TEMPLATE=$SOURCE_DIR/security-headers.conf.template
API_TEMPLATE=$SOURCE_DIR/api-location.conf.template

CONNECT_SRC_PLACEHOLDER=__VUESTRATA_CONNECT_SRC__
API_PATH_PLACEHOLDER=__VUESTRATA_API_PATH__
# Lines of a template that describe it as one. They are not copied.
TEMPLATE_NOTE='#@template'

CR=$(printf '\r')

# printf rather than echo throughout: some shells' echo reads backslash escapes.
log() {
  if [ -z "${NGINX_ENTRYPOINT_QUIET_LOGS:-}" ]; then
    printf '%s\n' "$ME: $*"
  fi
}

# Removes what this script renders. /tmp may outlive a container (a pod's
# emptyDir does), so an earlier start may have left its files here.
clear_outputs() {
  for output in runtime-config.js security-headers.conf api-location.conf; do
    if [ -e "$OUTPUT_DIR/$output" ]; then
      rm -f "$OUTPUT_DIR/$output"
    fi
  done
}

# However this script ends, short of finishing, nothing it rendered is left
# for nginx to find: not after a refused value, and not after a command that
# failed halfway through writing a file.
DONE=
trap '[ -n "$DONE" ] || clear_outputs' EXIT

# Stops the container.
fail() {
  printf '%s\n' "$ME: error: $*" >&2
  exit 1
}

# A shell variable name, and nothing that could turn the `eval` in read_env
# into something else.
is_name() {
  case "$1" in
    '' | [0-9]* | *[!A-Z0-9_]*) return 1 ;;
  esac
  return 0
}

# read_env NAME: VALUE becomes the variable's value, or empty when it is unset.
read_env() {
  is_name "$1" || fail "\"$1\" in $KEYS is not a variable name."
  eval "VALUE=\${$1-}"
}

# check_value NAME VALUE: stop unless VALUE is made of URL-safe characters:
# letters, digits and -_.~:/?#@&+,=%
#
# Not in the set, and therefore fatal: whitespace and newlines, both quotes,
# the backslash, `;`, `$`, `<`, `>`, braces, backticks, and every byte outside
# ASCII. Percent-encode what a URL needs beyond these.
check_value() {
  case "$2" in
    *[!A-Za-z0-9_.~:/?#@\&+,=%-]*)
      fail "$1 contains a character that is not allowed. A value set at container" \
        "start may hold only letters, digits and -_.~:/?#@&+,=% (no spaces, quotes," \
        "semicolons or newlines)."
      ;;
  esac
}

# lower TEXT: LOWER becomes TEXT in lower case. Only called on text that
# passed check_value, so it holds no newline for the substitution to drop.
lower() {
  case "$1" in
    *[A-Z]*) LOWER=$(printf '%s' "$1" | tr 'A-Z' 'a-z') ;;
    *) LOWER=$1 ;;
  esac
}

# origin_of NAME URL SCHEMES: ORIGIN becomes scheme://host[:port], lower-cased
# and without a default port, as the generator derives it. Stops unless the URL
# is absolute, its scheme is one of SCHEMES, and its host is a plain DNS name.
origin_of() {
  case "$2" in
    *://*) ;;
    *) fail "$1 must be an absolute URL such as https://api.example.com (received \"$2\")." ;;
  esac

  lower "${2%%://*}"
  scheme=$LOWER
  case " $3 " in
    *" $scheme "*) ;;
    *) fail "$1 must use one of these schemes: $3 (received \"$2\")." ;;
  esac

  # The authority ends at the first /, ? or #. Credentials (a DSN carries a
  # key) end at the last @.
  rest=${2#*://}
  authority=${rest%%[/?#]*}
  hostport=${authority##*@}
  case "$hostport" in
    *:*)
      host=${hostport%:*}
      port=${hostport##*:}
      case "$port" in
        '' | *[!0-9]* | ??????*) fail "$1 has an invalid port (received \"$2\")." ;;
      esac
      [ "$port" -le 65535 ] || fail "$1 has an invalid port (received \"$2\")."
      ;;
    *)
      host=$hostport
      port=
      ;;
  esac

  lower "$host"
  host=$LOWER
  case "$host" in
    '' | *[!a-z0-9.-]* | [.-]* | *[.-] | *..* | *.-* | *-.*)
      fail "$1 must name a host made of letters, digits, dots and hyphens (received \"$2\")."
      ;;
  esac

  case "$scheme:$port" in
    http:80 | ws:80 | https:443 | wss:443) port= ;;
  esac

  ORIGIN=$scheme://$host${port:+:$port}
}

# api_path_of NAME PATH: API_PATH becomes the path without its trailing
# slashes, or empty for "/", where no prefix separates the API from the app.
api_path_of() {
  path=$2
  while :; do
    case "$path" in
      */) path=${path%/} ;;
      *) break ;;
    esac
  done

  case "$path" in
    '') ;;
    *//* | *[!A-Za-z0-9_.~/-]*)
      fail "Cannot route $1=\"$2\" in nginx: a same-origin API path must be \"/\" followed" \
        "by segments of letters, digits and \"._~-\"."
      ;;
  esac
  API_PATH=$path
}

# add_connect ORIGIN: once each, in the order they were derived.
add_connect() {
  case "$CONNECT " in
    *" $1 "*) ;;
    *) CONNECT="$CONNECT $1" ;;
  esac
}

# has_text FILE TEXT: whether a line of FILE that is copied contains TEXT.
has_text() {
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$TEMPLATE_NOTE"*) ;;
      *"$2"*) return 0 ;;
    esac
  done <"$1"
  return 1
}

# First, so that nothing below can leave nginx an earlier start's files: a
# start that stops at a bad value must not be answered with the configuration
# of the one before it.
clear_outputs

for file in "$KEYS" "$HEADERS_TEMPLATE" "$API_TEMPLATE"; do
  [ -r "$file" ] || fail "$file is missing. The image was built without docker/runtime/."
done
has_text "$HEADERS_TEMPLATE" "$CONNECT_SRC_PLACEHOLDER" ||
  fail "$HEADERS_TEMPLATE has no $CONNECT_SRC_PLACEHOLDER placeholder. Run \`vpr security:headers\` and rebuild."
has_text "$API_TEMPLATE" "$API_PATH_PLACEHOLDER" ||
  fail "$API_TEMPLATE has no $API_PATH_PLACEHOLDER placeholder. Run \`vpr security:headers\` and rebuild."

CONFIG=      # the members of the runtime-config.js object
CONFIG_KEYS= # their names, for the log
CONNECT=     # origins for connect-src, each preceded by a space
API_PATH=    # the same-origin API path, when there is one

# Every value is validated in this loop, before anything is written.
while read -r kind name fallback || [ -n "$kind" ]; do
  # A checkout with CRLF line endings must not turn into a variable named "X\r".
  kind=${kind%"$CR"}
  name=${name%"$CR"}
  fallback=${fallback%"$CR"}

  case "$kind" in
    '' | '#'*) continue ;;
  esac

  read_env "$name"

  case "$kind" in
    config)
      [ -n "$VALUE" ] || continue
      check_value "$name" "$VALUE"
      # The character set above has no quote, no backslash and no control
      # character, so the value between quotes IS its JSON encoding. It also
      # has no `<`, so no `</script>` can appear in the file.
      CONFIG="${CONFIG:+$CONFIG,}\"$name\":\"$VALUE\""
      CONFIG_KEYS="$CONFIG_KEYS $name"
      ;;
    api)
      [ -n "$VALUE" ] || VALUE=$fallback
      check_value "$name" "$VALUE"
      case "$VALUE" in
        /*) api_path_of "$name" "$VALUE" ;;
        *)
          origin_of "$name" "$VALUE" 'http https'
          add_connect "$ORIGIN"
          ;;
      esac
      ;;
    connect)
      [ -n "$VALUE" ] || continue
      check_value "$name" "$VALUE"
      origin_of "$name" "$VALUE" 'http https ws wss'
      add_connect "$ORIGIN"
      ;;
    websocket)
      [ -n "$VALUE" ] || continue
      check_value "$name" "$VALUE"
      origin_of "$name" "$VALUE" 'http https ws wss'
      case "$ORIGIN" in
        https://*) ORIGIN=wss://${ORIGIN#https://} ;;
        http://*) ORIGIN=ws://${ORIGIN#http://} ;;
      esac
      add_connect "$ORIGIN"
      ;;
    *) fail "\"$kind\" in $KEYS is not a known entry. Run \`vpr security:headers\` and rebuild." ;;
  esac
done <"$KEYS"

# The two values that go into a sed replacement. Both were assembled above
# from validated parts; neither can hold the `|` delimiter, `&` or `\`, which
# is checked once more here because it is what the substitution relies on.
case "$CONNECT" in
  *[!a-z0-9.:/\ -]*) fail "internal error: unexpected character in the connect-src origins." ;;
esac
case "$API_PATH" in
  *[!A-Za-z0-9_.~/-]*) fail "internal error: unexpected character in the API path." ;;
esac

[ -d "$OUTPUT_DIR" ] || mkdir -p "$OUTPUT_DIR"

# render TEMPLATE PLACEHOLDER VALUE: the template without its note and without
# the carriage returns of a CRLF checkout, PLACEHOLDER replaced by VALUE.
render() {
  sed -e "s/$CR\$//" -e "/^$TEMPLATE_NOTE/d" -e "s|$2|$3|g" "$1"
}

printf 'window.__VUESTRATA_RUNTIME__ = {%s};\n' "$CONFIG" >"$OUTPUT_DIR/runtime-config.js"

# The placeholder is taken with the space before it, so a container with no
# origin to add leaves `connect-src 'self';` and not a stray space.
render "$HEADERS_TEMPLATE" " $CONNECT_SRC_PLACEHOLDER" "$CONNECT" \
  >"$OUTPUT_DIR/security-headers.conf"

if [ -n "$API_PATH" ]; then
  render "$API_TEMPLATE" "$API_PATH_PLACEHOLDER" "$API_PATH" >"$OUTPUT_DIR/api-location.conf"
else
  printf '%s\n' '# The API is on another origin, or at /: no same-origin path to answer for.' \
    >"$OUTPUT_DIR/api-location.conf"
fi

DONE=1

log "runtime config:${CONFIG_KEYS:- (none set; the built-in values apply)}"
log "connect-src: 'self'$CONNECT"
if [ -n "$API_PATH" ]; then
  log "unrouted $API_PATH/ is answered with a JSON 502"
fi
