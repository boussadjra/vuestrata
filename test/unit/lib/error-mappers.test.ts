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
import type { ApiResponseContext } from '@/lib/api/integration'

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
