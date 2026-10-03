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
# One kind of value may also hold a space: `text`, which is how a title such as
# "Acme Console" is set. It is written to the JavaScript file and to nothing
# else. Nothing that derives an origin or a path is ever handed one, and an
# entry that asks for both (the same variable as `text` and as `connect`) is
# held to the strict set by the second.
#
# NAMES. Every variable this script owns is lower-case. The names it reads from
# the environment come from the keys file and must be upper-case (is_name), so
# no entry can name one of the script's own variables and be answered with what
# the script last put there instead of what the container was started with.
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

me=40-vuestrata-runtime.sh
source_dir=${1:-/etc/vuestrata/runtime}
output_dir=${2:-/tmp/vuestrata}

keys=$source_dir/keys
headers_template=$source_dir/security-headers.conf.template
api_template=$source_dir/api-location.conf.template

connect_src_placeholder=__VUESTRATA_CONNECT_SRC__
api_path_placeholder=__VUESTRATA_API_PATH__
# Lines of a template that describe it as one. They are not copied.
template_note='#@template'

# Longer than any URL a browser is sure to accept. A value is one line of a
# file every page loads; nothing legitimate comes near this.
max_length=2048

cr=$(printf '\r')

# printf rather than echo throughout: some shells' echo reads backslash escapes.
log() {
  if [ -z "${NGINX_ENTRYPOINT_QUIET_LOGS:-}" ]; then
    printf '%s\n' "$me: $*"
  fi
}

# Removes what this script renders. /tmp may outlive a container (a pod's
# emptyDir does), so an earlier start may have left its files here.
clear_outputs() {
  for output in runtime-config.js security-headers.conf api-location.conf; do
    if [ -e "$output_dir/$output" ]; then
      rm -f "$output_dir/$output"
    fi
  done
}

# However this script ends, short of finishing, nothing it rendered is left
# for nginx to find: not after a refused value, and not after a command that
# failed halfway through writing a file.
finished=
trap '[ -n "$finished" ] || clear_outputs' EXIT

# Stops the container.
fail() {
  printf '%s\n' "$me: error: $*" >&2
  exit 1
}

# A shell variable name in capitals, and nothing that could turn the `eval` in
# read_env into something else. Capitals only: see NAMES above.
is_name() {
  case "$1" in
    '' | [0-9]* | *[!A-Z0-9_]*) return 1 ;;
  esac
  return 0
}

# read_env NAME: `value` becomes the variable's value, or empty when it is unset.
read_env() {
  is_name "$1" || fail "\"$1\" in $keys is not a variable name."
  case "$1" in
    # The shell resets IFS when it starts and this script sets LC_ALL above, so
    # neither would be what the container was started with.
    IFS | LC_ALL) fail "\"$1\" in $keys cannot be read from the environment: the shell sets it itself." ;;
  esac
  eval "value=\${$1-}"
}

# check_length NAME VALUE
check_length() {
  [ "${#2}" -le "$max_length" ] ||
    fail "$1 is longer than $max_length characters."
}

# check_value NAME VALUE: stop unless VALUE is made of URL-safe characters:
# letters, digits and -_.~:/?#@&+,=%
#
# Not in the set, and therefore fatal: whitespace and newlines, both quotes,
# the backslash, `;`, `$`, `<`, `>`, `*`, braces, backticks, and every byte
# outside ASCII. Percent-encode what a URL needs beyond these.
check_value() {
  check_length "$1" "$2"
  case "$2" in
    *[!A-Za-z0-9_.~:/?#@\&+,=%-]*)
      fail "$1 contains a character that is not allowed. A value set at container" \
        "start may hold only letters, digits and -_.~:/?#@&+,=% (no spaces, quotes," \
        "semicolons or newlines)."
      ;;
  esac
}

# check_text NAME VALUE: as check_value, and a space is allowed inside the
# value. Only for what is written to the JavaScript file and nowhere else.
check_text() {
  check_length "$1" "$2"
  case "$2" in
    *[!A-Za-z0-9_.~:/?#@\&+,=%\ -]*)
      fail "$1 contains a character that is not allowed. It may hold only letters," \
        "digits, spaces and -_.~:/?#@&+,=% (no quotes, semicolons or newlines)."
      ;;
    ' '* | *' ')
      fail "$1 starts or ends with a space."
      ;;
  esac
}

# add_config NAME VALUE: one more member of the runtime-config.js object.
#
# Both character sets above are without a quote, a backslash and a control
# character, so the value between quotes IS its JSON encoding. They are also
# without `<`, so no `</script>` can appear in the file.
add_config() {
  config="${config:+$config,}\"$1\":\"$2\""
  config_keys="$config_keys $1"
}

# lower TEXT: `lowered` becomes TEXT in lower case. Only called on text that
# passed check_value, so it holds no newline for the substitution to drop.
lower() {
  case "$1" in
    *[A-Z]*) lowered=$(printf '%s' "$1" | tr 'A-Z' 'a-z') ;;
    *) lowered=$1 ;;
  esac
}

# origin_of NAME URL SCHEMES: `origin` becomes scheme://host[:port], lower-cased
# and without a default port, as the generator derives it. Stops unless the URL
# is absolute, its scheme is one of SCHEMES, and its host is a plain DNS name.
origin_of() {
  case "$2" in
    *://*) ;;
    *) fail "$1 must be an absolute URL such as https://api.example.com (received \"$2\")." ;;
  esac

  lower "${2%%://*}"
  scheme=$lowered
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
        '' | *[!0-9]*) fail "$1 has an invalid port (received \"$2\")." ;;
      esac
      # As a URL parser reads it: 0443 is 443.
      while :; do
        case "$port" in
          0?*) port=${port#0} ;;
          *) break ;;
        esac
      done
      case "$port" in
        0 | ??????*) fail "$1 has an invalid port (received \"$2\")." ;;
      esac
      [ "$port" -le 65535 ] || fail "$1 has an invalid port (received \"$2\")."
      ;;
    *)
      host=$hostport
      port=
      ;;
  esac

  lower "$host"
  host=$lowered
  case "$host" in
    '' | *[!a-z0-9.-]* | [.-]* | *[.-] | *..* | *.-* | *-.*)
      fail "$1 must name a host made of letters, digits, dots and hyphens (received \"$2\")."
      ;;
  esac

  case "$scheme:$port" in
    http:80 | ws:80 | https:443 | wss:443) port= ;;
  esac

  origin=$scheme://$host${port:+:$port}
}

# api_path_of NAME PATH: `api_path` becomes the path without its trailing
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
  case "$path/" in
    */./* | */../*)
      fail "Cannot route $1=\"$2\" in nginx: a same-origin API path cannot have a \".\" or" \
        "\"..\" segment."
      ;;
  esac
  api_path=$path
}

# add_connect ORIGIN: once each, in the order they were derived.
add_connect() {
  case "$connect " in
    *" $1 "*) ;;
    *) connect="$connect $1" ;;
  esac
}

# has_text FILE TEXT: whether a line of FILE that is copied contains TEXT.
has_text() {
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$template_note"*) ;;
      *"$2"*) return 0 ;;
    esac
  done <"$1"
  return 1
}

# First, so that nothing below can leave nginx an earlier start's files: a
# start that stops at a bad value must not be answered with the configuration
# of the one before it.
clear_outputs

for file in "$keys" "$headers_template" "$api_template"; do
  [ -r "$file" ] || fail "$file is missing. The image was built without docker/runtime/."
done
has_text "$headers_template" "$connect_src_placeholder" ||
  fail "$headers_template has no $connect_src_placeholder placeholder. Run \`vpr security:headers\` and rebuild."
has_text "$api_template" "$api_path_placeholder" ||
  fail "$api_template has no $api_path_placeholder placeholder. Run \`vpr security:headers\` and rebuild."

config=      # the members of the runtime-config.js object
config_keys= # their names, for the log
connect=     # origins for connect-src, each preceded by a space
api_path=    # the same-origin API path, when there is one
api_name=    # the variable it came from, and what it held, for a message
api_given=
reserved=    # paths the server block answers itself, each preceded by a space

# Every value is validated in this loop, before anything is written.
while read -r kind name detail || [ -n "$kind" ]; do
  # A checkout with CRLF line endings must not turn into a variable named "X\r".
  kind=${kind%"$cr"}
  name=${name%"$cr"}
  detail=${detail%"$cr"}

  case "$kind" in
    '' | '#'*) continue ;;
    reserved)
      # Not a variable: a path, compared with the API path once it is known.
      case "$name" in
        /*) ;;
        *) fail "\"$name\" in $keys is not a path." ;;
      esac
      case "$name" in
        *[!A-Za-z0-9_.~/-]*) fail "\"$name\" in $keys is not a path." ;;
      esac
      reserved="$reserved $name"
      continue
      ;;
  esac

  read_env "$name"

  case "$kind" in
    config)
      [ -n "$value" ] || continue
      check_value "$name" "$value"
      add_config "$name" "$value"
      ;;
    text)
      [ -n "$value" ] || continue
      check_text "$name" "$value"
      add_config "$name" "$value"
      ;;
    enum)
      [ -n "$value" ] || continue
      check_value "$name" "$value"
      case " $detail " in
        *" $value "*) ;;
        *) fail "$name must be one of: $detail (received \"$value\")." ;;
      esac
      add_config "$name" "$value"
      ;;
    api)
      # Unset, or set to nothing: the app then calls the URL its bundle was
      # built with, so that is the one the headers must allow. The image
      # records it as this entry's third field.
      if [ -z "$value" ]; then
        [ -n "$detail" ] ||
          fail "$name is not set, and $keys records no API URL for the build. Run \`vpr security:headers\` and rebuild."
        value=$detail
      fi
      check_value "$name" "$value"
      case "$value" in
        /*)
          api_path_of "$name" "$value"
          api_name=$name
          api_given=$value
          ;;
        *)
          origin_of "$name" "$value" 'http https'
          add_connect "$origin"
          ;;
      esac
      ;;
    connect)
      [ -n "$value" ] || continue
      check_value "$name" "$value"
      origin_of "$name" "$value" 'http https ws wss'
      add_connect "$origin"
      ;;
    websocket)
      [ -n "$value" ] || continue
      check_value "$name" "$value"
      origin_of "$name" "$value" 'http https ws wss'
      case "$origin" in
        https://*) origin=wss://${origin#https://} ;;
        http://*) origin=ws://${origin#http://} ;;
      esac
      add_connect "$origin"
      ;;
    *) fail "\"$kind\" in $keys is not a known entry. Run \`vpr security:headers\` and rebuild." ;;
  esac
done <"$keys"

# nginx refuses two locations for one path, and would say "duplicate location"
# rather than which variable asked for it.
if [ -n "$api_path" ]; then
  case "$reserved " in
    *" $api_path "*)
      fail "Cannot route $api_name=\"$api_given\" in nginx: $api_path is a path this server" \
        "answers itself. Serve the API under another one, such as /api."
      ;;
  esac
fi

# The two values that go into a sed replacement. Both were assembled above
# from validated parts; neither can hold the `|` delimiter, `&` or `\`, which
# is checked once more here because it is what the substitution relies on.
case "$connect" in
  *[!a-z0-9.:/\ -]*) fail "internal error: unexpected character in the connect-src origins." ;;
esac
case "$api_path" in
  *[!A-Za-z0-9_.~/-]*) fail "internal error: unexpected character in the API path." ;;
esac

[ -d "$output_dir" ] || mkdir -p "$output_dir"

# render TEMPLATE PLACEHOLDER VALUE: the template without its note and without
# the carriage returns of a CRLF checkout, PLACEHOLDER replaced by VALUE.
render() {
  sed -e "s/$cr\$//" -e "/^$template_note/d" -e "s|$2|$3|g" "$1"
}

printf 'window.__VUESTRATA_RUNTIME__ = {%s};\n' "$config" >"$output_dir/runtime-config.js"

# The placeholder is taken with the space before it, so a container with no
# origin to add leaves `connect-src 'self';` and not a stray space.
render "$headers_template" " $connect_src_placeholder" "$connect" \
  >"$output_dir/security-headers.conf"

if [ -n "$api_path" ]; then
  render "$api_template" "$api_path_placeholder" "$api_path" >"$output_dir/api-location.conf"
else
  printf '%s\n' '# The API is on another origin, or at /: no same-origin path to answer for.' \
    >"$output_dir/api-location.conf"
fi

finished=1

log "runtime config:${config_keys:- (none set; the built-in values apply)}"
log "connect-src: 'self'$connect"
if [ -n "$api_path" ]; then
  log "unrouted $api_path/ is answered with a JSON 502"
fi
