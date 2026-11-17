import * as assert from 'assert'

// TODO: intentional violation to verify that the comment-check job fails
suite('quality gate check', () => {
  test('intentional failure to verify that the build job fails', () => {
    assert.fail('intentional failure for the quality gate check')
  })
})
