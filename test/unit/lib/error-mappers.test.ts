import { describe, expect, it } from 'vite-plus/test'

import {
  drfErrorMapper,
  errorMappers,
  laravelErrorMapper,
  nestErrorMapper,
  problemJsonErrorMapper,
  springBootErrorMapper,
  vuestrataErrorMapper,
} from '@/lib/api/error-mappers'
import type { ApiErrorMapper, ApiResponseContext } from '@/lib/api/integration'
import { httpError } from '@/lib/errors'

/**
 * One body per framework, as that framework really writes it: copied from its
 * default error rendering, not simplified to what the mapper happens to read.
 * A mapper is only useful if it survives the fields nobody asked for
 * (`timestamp`, `trace`, `rejectedValue`), and only safe if it answers `null`
 * for a body in someone else's format.
 */

function failed(
  status: number,
  body: unknown,
  contentType = 'application/json',
): ApiResponseContext {
  return {
    url: 'http://localhost/api/customers',
    method: 'POST',
    status,
    ok: false,
    headers: new Headers({ 'content-type': contentType }),
    contentType,
    redirected: false,
    responseUrl: 'http://localhost/api/customers',
    body,
    expectsJson: true,
  }
}

describe('problemJsonErrorMapper', () => {
  it('reads an ASP.NET Core ValidationProblemDetails, keeping the server field names', () => {
    const mapped = problemJsonErrorMapper(
      failed(
        400,
        {
          type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
          title: 'One or more validation errors occurred.',
          status: 400,
          errors: {
            Email: ['The Email field is not a valid e-mail address.'],
            'Address.City': ['The City field is required.'],
            'Items[0].Quantity': ['The field Quantity must be between 1 and 99.'],
            '': ['A customer needs a phone number or an email address.'],
          },
          traceId: '00-84c1fd4063c38d9f3900d06e56542d48-85d1d4-00',
        },
        'application/problem+json',
      ),
    )

    expect(mapped).toEqual({
      message: 'One or more validation errors occurred.',
      code: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
      details: {
        // PascalCase and bracket indexes are the server's spelling. Mapping
        // them onto form fields is the form layer's job.
        Email: ['The Email field is not a valid e-mail address.'],
        'Address.City': ['The City field is required.'],
        'Items[0].Quantity': ['The field Quantity must be between 1 and 99.'],
      },
      formErrors: ['A customer needs a phone number or an email address.'],
      requestId: '00-84c1fd4063c38d9f3900d06e56542d48-85d1d4-00',
    })
  })

  it('reads the RFC 9457 form: detail over title, and errors as a list of pointers', () => {
    const mapped = problemJsonErrorMapper(
      failed(
        422,
        {
          type: 'https://example.net/validation-error',
          title: "Your request parameters didn't validate.",
          detail: 'Two fields need your attention.',
          errors: [
            { detail: 'must be a positive integer', pointer: '#/age' },
            { detail: "must be 'green', 'red' or 'blue'", pointer: '#/profile/color' },
            { detail: 'must not be empty', pointer: '/items/1/sku' },
          ],
        },
        'application/problem+json',
      ),
    )

    expect(mapped).toEqual({
      message: 'Two fields need your attention.',
      code: 'https://example.net/validation-error',
      details: {
        age: ['must be a positive integer'],
        'profile.color': ["must be 'green', 'red' or 'blue'"],
        'items.1.sku': ['must not be empty'],
      },
    })
  })

  it('reads RFC 7807 invalid-params, and ignores an about:blank type and a bare reason phrase', () => {
    const mapped = problemJsonErrorMapper(
      failed(
        400,
        {
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          'invalid-params': [{ name: 'age', reason: 'must be a positive integer' }],
        },
        'application/problem+json',
      ),
    )

    // "Bad Request" says nothing the status does not, and says it in English.
    expect(mapped).toEqual({ details: { age: ['must be a positive integer'] } })
  })

  it('recognises the shape when the server labels it plain JSON', () => {
    const mapped = problemJsonErrorMapper(
      failed(404, {
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: 'No such order.',
      }),
    )

    expect(mapped).toEqual({ message: 'No such order.' })
  })

  it('leaves a body in another format to the next mapper', () => {
    expect(problemJsonErrorMapper(failed(422, { message: 'Nope', errors: {} }))).toBeNull()
    expect(problemJsonErrorMapper(failed(502, '<html>Bad Gateway</html>', 'text/html'))).toBeNull()
  })
})

describe('laravelErrorMapper', () => {
  it('reads a 422 from a form request, with dotted paths for nested input', () => {
    const mapped = laravelErrorMapper(
      failed(422, {
        message: 'The email has already been taken. (and 2 more errors)',
        errors: {
          email: ['The email has already been taken.'],
          'address.city': ['The address.city field is required.'],
          'items.0.quantity': ['The items.0.quantity field must be at least 1.'],
        },
      }),
    )

    expect(mapped).toEqual({
      message: 'The email has already been taken. (and 2 more errors)',
      details: {
        email: ['The email has already been taken.'],
        'address.city': ['The address.city field is required.'],
        'items.0.quantity': ['The items.0.quantity field must be at least 1.'],
      },
    })
  })

  it('reads the message of any other refusal', () => {
    expect(laravelErrorMapper(failed(403, { message: 'This action is unauthorized.' }))).toEqual({
      message: 'This action is unauthorized.',
    })
  })

  it('claims a body that only repeats the reason phrase, and reports nothing', () => {
    // Not null: the next mapper would read "Not Found" back out of `message`.
    expect(laravelErrorMapper(failed(404, { message: 'Not Found' }))).toEqual({})
  })

  it('leaves a body without a message or errors to the next mapper', () => {
    expect(laravelErrorMapper(failed(400, { detail: 'Not found.' }))).toBeNull()
    expect(laravelErrorMapper(failed(500, 'Server Error', 'text/plain'))).toBeNull()
  })
})

describe('drfErrorMapper', () => {
  it('flattens nested serializers and lists into dotted paths', () => {
    const mapped = drfErrorMapper(
      failed(400, {
        email: ['Enter a valid email address.'],
        contact_name: [
          'This field may not be blank.',
          'Ensure this field has at least 2 characters.',
        ],
        address: { city: ['This field is required.'] },
        // A `many=True` serializer: the first row was valid, the second was not.
        items: [{}, { quantity: ['A valid integer is required.'] }],
        non_field_errors: ['The delivery date must be after the order date.'],
      }),
    )

    expect(mapped).toEqual({
      message: 'The delivery date must be after the order date.',
      details: {
        email: ['Enter a valid email address.'],
        contact_name: [
          'This field may not be blank.',
          'Ensure this field has at least 2 characters.',
        ],
        'address.city': ['This field is required.'],
        'items.1.quantity': ['A valid integer is required.'],
      },
      formErrors: ['The delivery date must be after the order date.'],
    })
  })

  it('reads detail as the message, and keeps a code', () => {
    expect(drfErrorMapper(failed(404, { detail: 'No Customer matches the given query.' }))).toEqual(
      { message: 'No Customer matches the given query.' },
    )
    expect(
      drfErrorMapper(
        failed(401, {
          detail: 'Given token not valid for any token type',
          code: 'token_not_valid',
          messages: [
            { token_class: 'AccessToken', token_type: 'access', message: 'Token is expired' },
          ],
        }),
      ),
    ).toEqual({ message: 'Given token not valid for any token type', code: 'token_not_valid' })
  })

  it('drops a detail that only repeats the reason phrase', () => {
    expect(drfErrorMapper(failed(404, { detail: 'Not found.' }))).toEqual({})
  })

  it('names no single message when there are several form errors', () => {
    const mapped = drfErrorMapper(failed(400, { non_field_errors: ['First.', 'Second.'] }))

    expect(mapped).toEqual({ formErrors: ['First.', 'Second.'] })
  })

  it('reads a bare list as form errors', () => {
    expect(
      drfErrorMapper(failed(400, ['Invalid data. Expected a dictionary, but got str.'])),
    ).toEqual({
      message: 'Invalid data. Expected a dictionary, but got str.',
      formErrors: ['Invalid data. Expected a dictionary, but got str.'],
    })
  })

  it('leaves a body with no field lists to the next mapper', () => {
    expect(drfErrorMapper(failed(400, { message: 'Nope', code: 'BAD' }))).toBeNull()
    expect(drfErrorMapper(failed(502, '<html>Bad Gateway</html>', 'text/html'))).toBeNull()
  })
})

describe('nestErrorMapper', () => {
  it('reads a ValidationPipe failure: sentences, with no field to attach them to', () => {
    const mapped = nestErrorMapper(
      failed(400, {
        statusCode: 400,
        message: ['email must be an email', 'address.city should not be empty'],
        error: 'Bad Request',
      }),
    )

    expect(mapped).toEqual({
      formErrors: ['email must be an email', 'address.city should not be empty'],
    })
  })

  it('uses a lone validation message as the message too', () => {
    const mapped = nestErrorMapper(
      failed(400, { statusCode: 400, message: ['email must be an email'], error: 'Bad Request' }),
    )

    expect(mapped).toEqual({
      message: 'email must be an email',
      formErrors: ['email must be an email'],
    })
  })

  it('reads the message of a thrown HttpException, and never the reason phrase', () => {
    expect(
      nestErrorMapper(
        failed(409, { statusCode: 409, message: 'Email already registered', error: 'Conflict' }),
      ),
    ).toEqual({ message: 'Email already registered' })
    // `new ForbiddenException()` with no message of its own.
    expect(nestErrorMapper(failed(403, { statusCode: 403, message: 'Forbidden' }))).toEqual({})
  })

  it('leaves a body without statusCode to the next mapper', () => {
    expect(nestErrorMapper(failed(400, { message: 'Nope' }))).toBeNull()
  })
})

describe('springBootErrorMapper', () => {
  it('reads the default error attributes with binding errors included', () => {
    const mapped = springBootErrorMapper(
      failed(400, {
        timestamp: '2026-03-04T10:15:30.123+00:00',
        status: 400,
        error: 'Bad Request',
        trace: 'org.springframework.web.bind.MethodArgumentNotValidException: Validation failed…',
        message: "Validation failed for object='customerRequest'. Error count: 3",
        errors: [
          {
            codes: ['NotBlank.customerRequest.email', 'NotBlank.email', 'NotBlank'],
            defaultMessage: 'must not be blank',
            objectName: 'customerRequest',
            field: 'email',
            rejectedValue: '',
            bindingFailure: false,
            code: 'NotBlank',
          },
          {
            defaultMessage: 'size must be between 2 and 80',
            objectName: 'customerRequest',
            field: 'address.city',
            rejectedValue: 'X',
            code: 'Size',
          },
          {
            defaultMessage: 'A customer needs a phone number or an email address',
            objectName: 'customerRequest',
            code: 'ContactRequired',
          },
        ],
        path: '/api/customers',
      }),
    )

    expect(mapped).toEqual({
      message: "Validation failed for object='customerRequest'. Error count: 3",
      details: {
        email: ['must not be blank'],
        'address.city': ['size must be between 2 and 80'],
      },
      formErrors: ['A customer needs a phone number or an email address'],
    })
    // Not the stack trace, not the rejected values.
    expect(JSON.stringify(mapped)).not.toMatch(/MethodArgumentNotValidException|rejectedValue/)
  })

  it('reports nothing for the body Boot writes with messages switched off', () => {
    const mapped = springBootErrorMapper(
      failed(404, {
        timestamp: '2026-03-04T10:15:30.123+00:00',
        status: 404,
        error: 'Not Found',
        message: 'No message available',
        path: '/api/customers/42',
      }),
    )

    // Recognised, with nothing to report: the error falls back to the status's
    // own message, and no later mapper reads "No message available" as one.
    expect(mapped).toEqual({})
  })

  it('keeps the request id WebFlux adds', () => {
    const mapped = springBootErrorMapper(
      failed(409, {
        timestamp: '2026-03-04T10:15:30.123+00:00',
        path: '/api/customers',
        status: 409,
        error: 'Conflict',
        message: 'Email already registered',
        requestId: '7f1e9a2c-12',
      }),
    )

    expect(mapped).toEqual({ message: 'Email already registered', requestId: '7f1e9a2c-12' })
  })

  it('leaves a body without a timestamp to the next mapper', () => {
    expect(springBootErrorMapper(failed(400, { status: 400, message: 'Nope' }))).toBeNull()
  })
})

describe('vuestrataErrorMapper', () => {
  it('reads message, code, details and requestId', () => {
    const mapped = vuestrataErrorMapper(
      failed(422, {
        message: 'The email is already taken.',
        code: 'VALIDATION_FAILED',
        details: { email: ['Already taken'], 'address.city': ['Required'] },
        requestId: 'req-42',
      }),
    )

    expect(mapped).toEqual({
      message: 'The email is already taken.',
      code: 'VALIDATION_FAILED',
      details: { email: ['Already taken'], 'address.city': ['Required'] },
      requestId: 'req-42',
    })
  })

  it('always answers, so a body in no known format falls back to the status', () => {
    expect(vuestrataErrorMapper(failed(502, '<html>Bad Gateway</html>', 'text/html'))).toEqual({
      message: undefined,
      code: undefined,
      details: undefined,
      requestId: undefined,
    })
  })
})

describe('errorMappers', () => {
  it('names every shipped mapper', () => {
    expect(errorMappers).toEqual({
      vuestrata: vuestrataErrorMapper,
      problemJson: problemJsonErrorMapper,
      laravel: laravelErrorMapper,
      drf: drfErrorMapper,
      nest: nestErrorMapper,
      springBoot: springBootErrorMapper,
    })
  })

  it.each(Object.entries(errorMappers))('%s never throws on a body it cannot read', (_, mapper) => {
    for (const body of [
      undefined,
      null,
      '',
      'plain text',
      42,
      [],
      [1, 2],
      { nested: { deep: 1 } },
    ]) {
      expect(() => mapper(failed(500, body))).not.toThrow()
    }
  })
})

/**
 * An error body is whatever the other end of the connection sent. These are
 * the bodies a mapper must survive without throwing, without reaching
 * `Object.prototype`, and without losing the fields that were fine: a mapper
 * that throws is skipped by the client, and the next one reads less.
 */
describe('a hostile body', () => {
  /** The names that live on `Object.prototype`, as JSON delivers them: own keys. */
  const PROTOTYPE_NAMED = JSON.parse(
    `{
      "constructor": ["c"],
      "toString": ["t"],
      "hasOwnProperty": ["h"],
      "valueOf": ["v"],
      "__proto__": ["p"],
      "email": ["Already taken."]
    }`,
  ) as Record<string, string[]>

  /** An object nested `depth` levels deep, built without recursion. */
  function nested(depth: number): Record<string, unknown> {
    let value: Record<string, unknown> = { leaf: ['Too deep.'] }
    for (let level = 0; level < depth; level++) value = { child: value }
    return value
  }

  const HUGE = 'x'.repeat(2 * 1024 * 1024)
  const MARKUP = '<img src=x onerror="alert(1)"><script>alert(2)</script> & <b>bold</b>'

  /** Each mapper that reads fields, with a body in its own format around them. */
  const fieldMappers: [string, ApiErrorMapper, (fields: unknown) => unknown][] = [
    [
      'problemJson',
      problemJsonErrorMapper,
      (fields) => ({ title: 'Invalid.', status: 422, errors: fields }),
    ],
    ['laravel', laravelErrorMapper, (fields) => ({ message: 'Invalid.', errors: fields })],
    ['drf', drfErrorMapper, (fields) => fields],
    [
      'springBoot',
      springBootErrorMapper,
      (fields) => ({
        timestamp: '2026-03-04T10:15:30.123+00:00',
        status: 400,
        error: 'Bad Request',
        errors: Object.entries(fields as Record<string, unknown[]>).flatMap(([field, messages]) =>
          messages.map((defaultMessage) => ({ field, defaultMessage })),
        ),
      }),
    ],
  ]

  it.each(fieldMappers)(
    '%s keeps a field named like a member of Object.prototype',
    (_, mapper, bodyOf) => {
      const mapped = mapper(failed(422, bodyOf(PROTOTYPE_NAMED)))

      expect(mapped?.details).toBeDefined()
      const details = mapped!.details!
      expect(Object.keys(details).toSorted()).toEqual([
        '__proto__',
        'constructor',
        'email',
        'hasOwnProperty',
        'toString',
        'valueOf',
      ])
      // Own properties, each holding its messages, on an ordinary object.
      for (const [field, messages] of Object.entries(PROTOTYPE_NAMED)) {
        expect(Object.getOwnPropertyDescriptor(details, field)?.value).toEqual(messages)
      }
      expect(Object.getPrototypeOf(details)).toBe(Object.prototype)
      // And nothing leaked onto every other object.
      expect(({} as Record<string, unknown>).email).toBeUndefined()
      expect(Object.prototype.toString.call({})).toBe('[object Object]')
    },
  )

  it.each(fieldMappers)(
    '%s drops what is not a message, and keeps what is',
    (_, mapper, bodyOf) => {
      const mapped = mapper(
        failed(
          422,
          bodyOf({ qty: [5, null, true, ['nested'], { a: 1 }, '', '   ', 'Must be positive.'] }),
        ),
      )

      expect(mapped?.details?.qty).toEqual(['Must be positive.'])
    },
  )

  it.each(fieldMappers)('%s cuts a two-megabyte message down to size', (_, mapper, bodyOf) => {
    const mapped = mapper(failed(422, bodyOf({ notes: [HUGE] })))

    const [message] = mapped!.details!.notes!
    expect(message!.length).toBeLessThan(2_100)
    expect(message!.endsWith('…')).toBe(true)
  })

  it.each(fieldMappers)('%s leaves markup in a message as the text it is', (_, mapper, bodyOf) => {
    const mapped = mapper(failed(422, bodyOf({ name: [MARKUP] })))

    // Not stripped, not escaped, not interpreted: a string, for a template to
    // render as text.
    expect(mapped!.details!.name).toEqual([MARKUP])
  })

  it.each(Object.entries(errorMappers))(
    '%s survives nesting deep enough to overflow a recursive reader',
    (_, mapper) => {
      const deep = nested(20_000)
      const bodies = [
        deep,
        { message: 'Invalid.', errors: deep },
        { title: 'Invalid.', status: 422, errors: deep },
        { statusCode: 400, message: deep },
        { timestamp: 'now', status: 400, errors: [deep] },
        { detail: deep, items: [deep, [deep]] },
      ]

      for (const body of bodies) expect(() => mapper(failed(422, body))).not.toThrow()
    },
  )

  it('drf follows a tree only so far, and still reads what is near the top', () => {
    const mapped = drfErrorMapper(failed(400, { email: ['Required.'], profile: nested(20_000) }))

    expect(mapped?.details).toEqual({ email: ['Required.'] })
  })

  it.each(Object.entries(errorMappers))(
    '%s survives lists where objects belong, and objects where lists belong',
    (_, mapper) => {
      const bodies = [
        { message: 'Invalid.', errors: ['a', 'b'] },
        { message: 'Invalid.', errors: [['a'], [{ b: 1 }]] },
        { message: ['a', 5, null, { b: 1 }], errors: 'nope', statusCode: 400 },
        { title: 'Invalid.', status: 422, errors: [null, 5, 'x', [], { pointer: 7, detail: {} }] },
        { title: 'Invalid.', status: 422, 'invalid-params': { name: 'a', reason: 'b' } },
        { timestamp: 1, status: 400, errors: { field: 'a', defaultMessage: 'b' } },
        { timestamp: 1, status: 400, errors: [null, 'x', [], { field: [], defaultMessage: {} }] },
        { detail: ['a'], code: { a: 1 }, non_field_errors: { b: ['c'] } },
        [[['a']], { b: [{ c: ['d'] }] }, null, 5],
        { message: HUGE, title: HUGE, detail: HUGE, status: 400, statusCode: 400, timestamp: 1 },
      ]

      for (const body of bodies) {
        const context = failed(422, body)
        expect(() => mapper(context)).not.toThrow()
        // Whatever it made of it, every message is a string.
        const mapped = mapper(context)
        for (const messages of Object.values(mapped?.details ?? {})) {
          if (!Array.isArray(messages)) continue
          expect(messages.every((message) => typeof message === 'string')).toBe(true)
        }
        expect((mapped?.formErrors ?? []).every((message) => typeof message === 'string')).toBe(
          true,
        )
      }
    },
  )

  it('nest keeps the sentences of a list and drops the rest', () => {
    const mapped = nestErrorMapper(
      failed(400, {
        statusCode: 400,
        message: ['email must be an email', 7, null, { constructor: 'x' }, MARKUP, HUGE],
        error: 'Bad Request',
      }),
    )

    expect(mapped?.formErrors).toHaveLength(3)
    expect(mapped?.formErrors?.slice(0, 2)).toEqual(['email must be an email', MARKUP])
    expect(mapped!.formErrors![2]!.length).toBeLessThan(2_100)
  })

  it('a top-level message is cut down too, and its markup left as text', () => {
    expect(laravelErrorMapper(failed(409, { message: HUGE }))!.message!.length).toBeLessThan(2_100)
    expect(drfErrorMapper(failed(403, { detail: MARKUP }))).toEqual({ message: MARKUP })
    expect(
      problemJsonErrorMapper(failed(409, { title: 'x', status: 409, detail: MARKUP })),
    ).toEqual({
      message: MARKUP,
    })
  })
})

/**
 * A 500 is not a validation failure. Whatever a mapper reads in its body — and
 * a stack trace or a list of failed queries reads exactly like field errors —
 * none of it may reach an `AppError`, where a form would print it.
 */
describe('the body of a 5xx', () => {
  const SECRET = 'Server=db-7.internal;Password=hunter2'

  const serverErrors: [string, ApiErrorMapper, unknown, string?][] = [
    [
      'vuestrata',
      vuestrataErrorMapper,
      { message: SECRET, code: 'DB_POOL', details: { db: [SECRET] }, requestId: 'req-1' },
    ],
    [
      'problemJson',
      problemJsonErrorMapper,
      {
        type: `https://errors.internal/db?conn=${SECRET}`,
        title: SECRET,
        status: 500,
        detail: SECRET,
        errors: { Db: [SECRET], '': [SECRET] },
        traceId: 'req-1',
      },
      'application/problem+json',
    ],
    ['laravel', laravelErrorMapper, { message: SECRET, errors: { query: [SECRET] } }],
    [
      'drf',
      drfErrorMapper,
      { detail: SECRET, trace: [SECRET, SECRET], non_field_errors: [SECRET] },
    ],
    ['nest', nestErrorMapper, { statusCode: 500, message: [SECRET], error: SECRET }],
    [
      'springBoot',
      springBootErrorMapper,
      {
        timestamp: '2026-03-04T10:15:30.123+00:00',
        status: 500,
        error: 'Internal Server Error',
        message: SECRET,
        errors: [{ field: 'dataSource', defaultMessage: SECRET }, { defaultMessage: SECRET }],
        requestId: 'req-1',
      },
    ],
  ]

  it.each(serverErrors)('%s: nothing of it reaches the error', (_, mapper, body, contentType) => {
    const error = httpError(500, mapper(failed(500, body, contentType)))

    expect(error.details).toBeUndefined()
    expect(error.formErrors).toBeUndefined()
    expect(error.serverMessage).toBeUndefined()
    expect(error.message).toBe('An unexpected error occurred. Please try again.')
    expect(
      JSON.stringify([error.message, error.code, error.requestId, error.messageKey]),
    ).not.toContain('hunter2')
    expect(JSON.stringify(error.toApiError())).not.toContain('hunter2')
  })

  it('keeps a code that is an identifier, and the request id', () => {
    const error = httpError(500, vuestrataErrorMapper(failed(500, serverErrors[0]![2])))

    expect(error).toMatchObject({ code: 'DB_POOL', requestId: 'req-1', status: 500 })
  })

  it('drops a code that is a URL: the problem type is not an identifier', () => {
    const problem = failed(500, serverErrors[1]![2], 'application/problem+json')

    expect(problemJsonErrorMapper(problem)?.code).toContain('https://')
    expect(httpError(500, problemJsonErrorMapper(problem)).code).toBe('API_ERROR')
    // For a 4xx the type is the code, as before.
    expect(httpError(409, problemJsonErrorMapper({ ...problem, status: 409 })).code).toContain(
      'https://errors.internal/db',
    )
  })
})
