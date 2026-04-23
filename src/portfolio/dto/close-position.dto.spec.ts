import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClosePositionDto } from './close-position.dto';

describe('ClosePositionDto', () => {
  it('accepts full close without percentage', async () => {
    const dto = plainToInstance(ClosePositionDto, { type: 'full' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts partial close with valid percentage', async () => {
    const dto = plainToInstance(ClosePositionDto, {
      type: 'partial',
      percentage: 25,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects partial close when percentage is missing', async () => {
    const dto = plainToInstance(ClosePositionDto, { type: 'partial' });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects percentage above 100', async () => {
    const dto = plainToInstance(ClosePositionDto, {
      type: 'partial',
      percentage: 101,
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
