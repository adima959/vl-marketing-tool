-- ============================================================================
-- Marketing Tracker Seed Data
-- Version: 002
-- Description: Populates the Marketing Tracker with realistic sample data
--              based on the Vitaliv "Flex Repair" product for testing and
--              development purposes.
-- ============================================================================

DO $$
DECLARE
    -- User reference
    v_owner_id UUID;

    -- Product
    v_product_id UUID;

    -- Angles
    v_angle_1_id UUID;  -- Joint Pain & Daily Life
    v_angle_2_id UUID;  -- Active Lifestyle
    v_angle_3_id UUID;  -- Natural Alternative to Medication

    -- Messages for Angle 1 (Joint Pain & Daily Life)
    v_message_1_1_id UUID;  -- Can't play with grandkids
    v_message_1_2_id UUID;  -- Can't sleep due to joint pain
    v_message_1_3_id UUID;  -- Getting in/out of car is painful

    -- Messages for Angle 2 (Active Lifestyle)
    v_message_2_1_id UUID;  -- Back to golf
    v_message_2_2_id UUID;  -- Skiing/active winter sports

    -- Messages for Angle 3 (Natural Alternative)
    v_message_3_1_id UUID;  -- Tired of pills

BEGIN
    -- ========================================================================
    -- GET OWNER (first user from app_users)
    -- ========================================================================
    SELECT id INTO v_owner_id FROM app_users ORDER BY created_at LIMIT 1;

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'No users found in app_users. Please create at least one user first.';
    END IF;

    RAISE NOTICE 'Using owner_id: %', v_owner_id;

    -- ========================================================================
    -- PRODUCT: Flex Repair
    -- ========================================================================
    INSERT INTO app_products (name, description, notes, owner_id)
    VALUES (
        'Flex Repair',
        '<p><strong>Flex Repair</strong> is a premium natural joint support supplement designed for adults experiencing joint discomfort and reduced mobility.</p>
<p>Our formula combines three powerful natural ingredients backed by centuries of traditional use:</p>
<ul>
<li><strong>Turmeric</strong> - Contains curcumin, known for its natural anti-inflammatory properties</li>
<li><strong>Ginger</strong> - Supports healthy inflammatory response and circulation</li>
<li><strong>Boswellia Serrata</strong> - Traditional Ayurvedic herb for joint comfort</li>
</ul>
<p>Each ingredient is carefully sourced and tested for purity and potency. Our formula uses bioavailable forms for maximum absorption.</p>',
        'Subscription model with 40% first month discount. Price: 269.4 SEK/month. Key markets: Sweden, Norway, Denmark. Primary demographic: Adults 50+ with joint discomfort.',
        v_owner_id
    )
    RETURNING id INTO v_product_id;

    RAISE NOTICE 'Created product Flex Repair: %', v_product_id;

    -- ========================================================================
    -- ANGLE 1: Joint Pain & Daily Life (live)
    -- ========================================================================
    INSERT INTO app_angles (product_id, name, description, status, launched_at)
    VALUES (
        v_product_id,
        'Joint Pain & Daily Life',
        'Joint pain interfering with everyday activities and family moments. This angle focuses on the emotional impact of joint pain on daily life quality and relationships with loved ones.',
        'live',
        NOW() - INTERVAL '2 months'
    )
    RETURNING id INTO v_angle_1_id;

    RAISE NOTICE 'Created angle 1 (Joint Pain & Daily Life): %', v_angle_1_id;

    -- ------------------------------------------------------------------------
    -- MESSAGE 1.1: Can't play with grandkids (live)
    -- ------------------------------------------------------------------------
    INSERT INTO app_messages (
        angle_id, name, description, specific_pain_point, core_promise,
        key_idea, primary_hook_direction, headlines, status, launched_at
    )
    VALUES (
        v_angle_1_id,
        'Can''t play with grandkids',
        'Targets grandparents who feel joint pain is stealing precious time with grandchildren. Emotional appeal focusing on family moments and the irreplaceable nature of childhood.',
        'I can''t keep up with my grandchildren anymore',
        'Move freely and be present for precious family moments',
        'Joint pain steals irreplaceable time with the people you love most',
        'Emotional grandparent scenes - before/after transformation',
        ARRAY['Keep up with your grandchildren again', 'Don''t let stiff joints steal these moments', 'They grow up fast. Don''t miss it.'],
        'live',
        NOW() - INTERVAL '6 weeks'
    )
    RETURNING id INTO v_message_1_1_id;

    RAISE NOTICE 'Created message 1.1 (Can''t play with grandkids): %', v_message_1_1_id;

    -- Creatives for Message 1.1
    INSERT INTO app_creatives (message_id, geo, name, format, cta, url, notes)
    VALUES
    (
        v_message_1_1_id,
        'NO',
        'Grandparent testimonial - playing in park',
        'ugc_video',
        'Prøv Flex Repair',
        'https://drive.google.com/flexrepair/no/grandkids-ugc-v1',
        'Norwegian grandmother testimonial. Shot in Frogner Park, Oslo. 45 seconds. Features before/after daily routine comparison.'
    ),
    (
        v_message_1_1_id,
        'SE',
        'Before/after lifestyle imagery',
        'static_image',
        'Testa Flex Repair',
        'https://drive.google.com/flexrepair/se/grandkids-static-v1',
        'Swedish static image set. Shows grandparent playing with grandchildren. Split image before/after concept.'
    );

    RAISE NOTICE 'Created creatives for message 1.1';

    -- Assets for Message 1.1
    INSERT INTO app_assets (message_id, geo, type, name, url, content, notes)
    VALUES
    (
        v_message_1_1_id,
        'NO',
        'landing_page',
        'Landing Page - Grandkids (NO)',
        'https://vitaliv.no/flex-repair/grandkids',
        NULL,
        'Norwegian landing page targeting grandparents. Includes testimonial section, ingredient breakdown, and subscription offer.'
    ),
    (
        v_message_1_1_id,
        'SE',
        'landing_page',
        'Landing Page - Barnbarn (SE)',
        'https://vitaliv.se/flex-repair/barnbarn',
        NULL,
        'Swedish landing page targeting grandparents. Localized content with Swedish testimonials.'
    ),
    (
        v_message_1_1_id,
        'DK',
        'text_ad',
        'Facebook Primary Text (DK)',
        NULL,
        'Mine led holdt mig væk fra mine børnebørn i årevis. Jeg prøvede alt - intet virkede.

Så opdagede jeg Flex Repair. Naturlige ingredienser som gurkemeje og ingefær, der faktisk virker.

Nu leger jeg med børnebørnene igen. Hver dag. Uden at betale prisen dagen efter.

Prøv Flex Repair i dag med 40% rabat på din første måned.',
        'Danish Facebook ad primary text. Emotional story arc with product introduction and offer.'
    );

    RAISE NOTICE 'Created assets for message 1.1';

    -- ------------------------------------------------------------------------
    -- MESSAGE 1.2: Can't sleep due to joint pain (in_production)
    -- ------------------------------------------------------------------------
    INSERT INTO app_messages (
        angle_id, name, description, specific_pain_point, core_promise,
        key_idea, primary_hook_direction, headlines, status, launched_at
    )
    VALUES (
        v_angle_1_id,
        'Can''t sleep due to joint pain',
        'Targets people whose joint pain disrupts sleep. Focuses on the vicious cycle of pain preventing restorative sleep, which prevents healing.',
        'I toss and turn all night because of joint pain',
        'Wake up refreshed, not in pain',
        'Night pain is different - your body heals during sleep, but pain prevents that healing',
        'Relatable night pain scenes, morning relief transformation',
        ARRAY['Finally sleep through the night', 'Stop dreading bedtime', 'Morning stiffness starts at night'],
        'in_production',
        NULL
    )
    RETURNING id INTO v_message_1_2_id;

    RAISE NOTICE 'Created message 1.2 (Can''t sleep due to joint pain): %', v_message_1_2_id;

    -- ------------------------------------------------------------------------
    -- MESSAGE 1.3: Getting in/out of car is painful (idea)
    -- ------------------------------------------------------------------------
    INSERT INTO app_messages (
        angle_id, name, description, specific_pain_point, core_promise,
        key_idea, primary_hook_direction, headlines, status, launched_at
    )
    VALUES (
        v_angle_1_id,
        'Getting in/out of car is painful',
        'Targets people who struggle with simple daily movements. Focuses on micro-moments of struggle that accumulate to loss of independence.',
        'Simple movements like getting out of my car have become a struggle',
        'Move like you used to - naturally and without thinking',
        'When small movements become obstacles, you''ve lost more than mobility - you''ve lost freedom',
        'Daily micro-moments of struggle to freedom',
        ARRAY['Remember when getting up was easy?', 'Your car shouldn''t feel like a trap'],
        'idea',
        NULL
    )
    RETURNING id INTO v_message_1_3_id;

    RAISE NOTICE 'Created message 1.3 (Getting in/out of car is painful): %', v_message_1_3_id;

    -- ========================================================================
    -- ANGLE 2: Active Lifestyle (idea)
    -- ========================================================================
    INSERT INTO app_angles (product_id, name, description, status, launched_at)
    VALUES (
        v_product_id,
        'Active Lifestyle',
        'Joint issues preventing sports, hobbies, and active pursuits. This angle targets people who have had to give up activities they love due to joint problems.',
        'idea',
        NULL
    )
    RETURNING id INTO v_angle_2_id;

    RAISE NOTICE 'Created angle 2 (Active Lifestyle): %', v_angle_2_id;

    -- ------------------------------------------------------------------------
    -- MESSAGE 2.1: Back to golf (idea)
    -- ------------------------------------------------------------------------
    INSERT INTO app_messages (
        angle_id, name, description, specific_pain_point, core_promise,
        key_idea, primary_hook_direction, headlines, status, launched_at
    )
    VALUES (
        v_angle_2_id,
        'Back to golf',
        'Targets golfers who have had to reduce or give up golf due to joint pain. Golf represents identity, social connection, and lifestyle.',
        'I had to give up golf because of my joints',
        'Play 18 holes without paying for it tomorrow',
        'Golf isn''t just a sport - it''s your identity, your friends, your weekends',
        'Golf-specific lifestyle, course footage',
        ARRAY['Get back on the course', 'Your clubs are waiting'],
        'idea',
        NULL
    )
    RETURNING id INTO v_message_2_1_id;

    RAISE NOTICE 'Created message 2.1 (Back to golf): %', v_message_2_1_id;

    -- ------------------------------------------------------------------------
    -- MESSAGE 2.2: Skiing/active winter sports (idea)
    -- ------------------------------------------------------------------------
    INSERT INTO app_messages (
        angle_id, name, description, specific_pain_point, core_promise,
        key_idea, primary_hook_direction, headlines, status, launched_at
    )
    VALUES (
        v_angle_2_id,
        'Skiing/active winter sports',
        'Targets people in Nordic countries who love winter sports but feel their joints can''t handle it anymore. Seasonal urgency angle.',
        'My knees can''t handle the slopes anymore',
        'Hit the slopes all season',
        'Don''t let joint pain put your skis in storage',
        'Seasonal urgency, mountain lifestyle',
        ARRAY['Ski season is coming', 'Don''t watch from the lodge'],
        'idea',
        NULL
    )
    RETURNING id INTO v_message_2_2_id;

    RAISE NOTICE 'Created message 2.2 (Skiing/active winter sports): %', v_message_2_2_id;

    -- ========================================================================
    -- ANGLE 3: Natural Alternative to Medication (idea)
    -- ========================================================================
    INSERT INTO app_angles (product_id, name, description, status, launched_at)
    VALUES (
        v_product_id,
        'Natural Alternative to Medication',
        'Positioning against prescription pain medication and dependency. This angle targets people concerned about long-term medication use and seeking natural alternatives.',
        'idea',
        NULL
    )
    RETURNING id INTO v_angle_3_id;

    RAISE NOTICE 'Created angle 3 (Natural Alternative to Medication): %', v_angle_3_id;

    -- ------------------------------------------------------------------------
    -- MESSAGE 3.1: Tired of pills (idea)
    -- ------------------------------------------------------------------------
    INSERT INTO app_messages (
        angle_id, name, description, specific_pain_point, core_promise,
        key_idea, primary_hook_direction, headlines, status, launched_at
    )
    VALUES (
        v_angle_3_id,
        'Tired of pills',
        'Targets people who are frustrated with traditional pain medication. Appeals to desire for natural solutions with scientific backing.',
        'I don''t want to depend on painkillers',
        'Natural support your body can use',
        'Turmeric and ginger have been used for centuries - now in a modern formula',
        'Natural ingredients, science-backed tradition',
        ARRAY['Nature has a better answer', 'Stop the pill cycle'],
        'idea',
        NULL
    )
    RETURNING id INTO v_message_3_1_id;

    RAISE NOTICE 'Created message 3.1 (Tired of pills): %', v_message_3_1_id;

    -- ========================================================================
    -- SUMMARY
    -- ========================================================================
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Marketing Tracker seed data created successfully!';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Product: Flex Repair (%)' , v_product_id;
    RAISE NOTICE '  - Angle 1: Joint Pain & Daily Life (live) - 3 messages';
    RAISE NOTICE '    - Message 1.1: Can''t play with grandkids (live) - 2 creatives, 3 assets';
    RAISE NOTICE '    - Message 1.2: Can''t sleep due to joint pain (in_production)';
    RAISE NOTICE '    - Message 1.3: Getting in/out of car is painful (idea)';
    RAISE NOTICE '  - Angle 2: Active Lifestyle (idea) - 2 messages';
    RAISE NOTICE '    - Message 2.1: Back to golf (idea)';
    RAISE NOTICE '    - Message 2.2: Skiing/active winter sports (idea)';
    RAISE NOTICE '  - Angle 3: Natural Alternative to Medication (idea) - 1 message';
    RAISE NOTICE '    - Message 3.1: Tired of pills (idea)';
    RAISE NOTICE '============================================================';

END $$;

-- ============================================================================
-- END OF SEED DATA
-- ============================================================================
