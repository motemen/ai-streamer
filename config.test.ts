import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getAvailableAvatars, generateSystemPrompt, ConfigSchema } from './config.js';

describe('getAvailableAvatars', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'avatars-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return avatar names from image files', () => {
    writeFileSync(path.join(tempDir, 'default.png'), '');
    writeFileSync(path.join(tempDir, '喜び.jpg'), '');
    writeFileSync(path.join(tempDir, '当惑.webp'), '');
    writeFileSync(path.join(tempDir, 'readme.txt'), '');

    const avatars = getAvailableAvatars(tempDir);
    
    expect(avatars).toEqual(['default', '喜び', '当惑']);
  });

  it('should put default first if it exists', () => {
    writeFileSync(path.join(tempDir, '喜び.png'), '');
    writeFileSync(path.join(tempDir, 'default.png'), '');
    writeFileSync(path.join(tempDir, '当惑.png'), '');

    const avatars = getAvailableAvatars(tempDir);
    
    expect(avatars[0]).toBe('default');
    expect(avatars).toContain('喜び');
    expect(avatars).toContain('当惑');
  });

  it('should work without default avatar', () => {
    writeFileSync(path.join(tempDir, '喜び.png'), '');
    writeFileSync(path.join(tempDir, '当惑.png'), '');

    const avatars = getAvailableAvatars(tempDir);
    
    expect(avatars).toEqual(['喜び', '当惑']);
  });

  it('should filter only image files', () => {
    writeFileSync(path.join(tempDir, 'avatar1.png'), '');
    writeFileSync(path.join(tempDir, 'avatar2.jpg'), '');
    writeFileSync(path.join(tempDir, 'avatar3.jpeg'), '');
    writeFileSync(path.join(tempDir, 'avatar4.gif'), '');
    writeFileSync(path.join(tempDir, 'avatar5.webp'), '');
    writeFileSync(path.join(tempDir, 'not-image.txt'), '');
    writeFileSync(path.join(tempDir, 'config.json'), '');

    const avatars = getAvailableAvatars(tempDir);
    
    expect(avatars).toEqual(['avatar1', 'avatar2', 'avatar3', 'avatar4', 'avatar5']);
  });

  it('should return default only when directory does not exist', () => {
    const nonExistentDir = path.join(tempDir, 'non-existent');
    
    const avatars = getAvailableAvatars(nonExistentDir);
    
    expect(avatars).toEqual(['default']);
  });

  it('should return empty array when no image files exist', () => {
    writeFileSync(path.join(tempDir, 'readme.txt'), '');
    writeFileSync(path.join(tempDir, 'config.json'), '');

    const avatars = getAvailableAvatars(tempDir);
    
    expect(avatars).toEqual([]);
  });
});

describe('generateSystemPrompt', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'avatars-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return base prompt when avatar is disabled', () => {
    const config = ConfigSchema.parse({
      prompt: 'テストプロンプト',
      avatar: { enabled: false }
    });

    const result = generateSystemPrompt(config);
    
    expect(result).toBe('テストプロンプト');
  });

  it('should return the prompt as-is when avatar config is not provided', () => {
    const config = ConfigSchema.parse({
      prompt: 'テストプロンプト'
    });

    const result = generateSystemPrompt(config);
    
    expect(result).toBe('テストプロンプト');
  });

  it('should return the prompt as-is even when avatar is enabled', () => {
    writeFileSync(path.join(tempDir, 'default.png'), '');
    writeFileSync(path.join(tempDir, '喜び.png'), '');

    const config = ConfigSchema.parse({
      prompt: 'テストプロンプト',
      avatar: { 
        enabled: true,
        directory: tempDir
      }
    });

    const result = generateSystemPrompt(config);
    
    expect(result).toBe('テストプロンプト');
  });

  it('should return the prompt as-is when using default avatar directory', () => {
    const config = ConfigSchema.parse({
      prompt: 'テストプロンプト',
      avatar: { enabled: true }
    });

    const result = generateSystemPrompt(config);
    
    expect(result).toBe('テストプロンプト');
  });

  it('should return the prompt as-is even with empty avatar directory', () => {
    // 空のディレクトリ
    const config = ConfigSchema.parse({
      prompt: 'テストプロンプト',
      avatar: { 
        enabled: true,
        directory: tempDir
      }
    });

    const result = generateSystemPrompt(config);
    
    expect(result).toBe('テストプロンプト');
  });
});