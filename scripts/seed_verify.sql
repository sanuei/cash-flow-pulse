-- ============================================================================
-- Seed 模板数据 — Part 2: 校验查询
-- ============================================================================
SELECT 'cash_sources' as t, COUNT(*) as n FROM cash_sources WHERE user_id='bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381'
UNION ALL SELECT 'credit_cards', COUNT(*) FROM credit_cards WHERE user_id='bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381'
UNION ALL SELECT 'recurring_bills', COUNT(*) FROM recurring_bills WHERE user_id='bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381'
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions WHERE user_id='bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381';

SELECT 'recurring_investments' as t, COUNT(*) as n FROM recurring_investments WHERE user_id='bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381'
UNION ALL SELECT 'recurring_incomes', COUNT(*) FROM recurring_incomes WHERE user_id='bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381'
UNION ALL SELECT 'snapshots', COUNT(*) FROM snapshots WHERE user_id='bc8720b4-edf3-48e1-a7ce-a3a1a0cbb381';
